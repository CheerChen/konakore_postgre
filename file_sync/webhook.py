# file_sync/webhook.py
from flask import Flask, request, jsonify
import threading
import time
import logging
from .scheduler import run_sync_cycle

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 全局状态
sync_thread = None
sync_running = False
sync_lock = threading.Lock()


def adaptive_sync_process():
    """自适应同步进程，支持自动停止"""
    global sync_running
    
    logger.info("[FileSync] Starting adaptive sync process...")
    empty_check_count = 0
    max_empty_checks = 10  # 连续10次空查询后停止
    
    try:
        while sync_running:
            logger.info(f"[FileSync] Starting sync cycle at {time.strftime('%Y-%m-%d %H:%M:%S')}")
            
            # 执行同步周期
            processed_count, completed_downloads, deleted_files = run_sync_cycle()
            
            # 检查是否有活动
            total_activity = processed_count + completed_downloads + deleted_files
            
            if total_activity == 0:
                empty_check_count += 1
                logger.info(f"[FileSync] Empty check {empty_check_count}/{max_empty_checks}")
            else:
                empty_check_count = 0  # 重置计数
                logger.info(f"[FileSync] Activity detected: {processed_count} processed, {completed_downloads} completed, {deleted_files} deleted")
            
            # 检查是否应该停止
            if empty_check_count >= max_empty_checks:
                logger.info("[FileSync] No activity detected for 10 cycles, stopping sync process...")
                break
            
            # 动态调整检查间隔
            if empty_check_count == 0:
                interval = 30  # 有活动时，30秒检查一次
            elif empty_check_count <= 3:
                interval = 60  # 开始空闲，1分钟检查一次
            elif empty_check_count <= 6:
                interval = 120  # 继续空闲，2分钟检查一次
            else:
                interval = 180  # 长时间空闲，3分钟检查一次
            
            logger.info(f"[FileSync] Next check in {interval} seconds")
            
            # 分段睡眠，允许快速停止
            for _ in range(interval):
                if not sync_running:
                    break
                time.sleep(1)
                
    except Exception as e:
        logger.error(f"[FileSync] Error in sync process: {e}")
    finally:
        with sync_lock:
            global sync_thread
            sync_running = False
            sync_thread = None
        logger.info("[FileSync] Sync process stopped")


@app.route('/trigger', methods=['POST'])
def trigger_sync():
    """触发文件同步"""
    global sync_thread, sync_running
    
    try:
        data = request.get_json() or {}
        action = data.get('action', 'start')
        
        with sync_lock:
            if action == 'start':
                if sync_running:
                    logger.info("[FileSync] Sync already running, ignoring trigger")
                    return jsonify({'status': 'already_running', 'message': 'Sync process is already active'})
                
                # 启动新的同步线程
                sync_running = True
                sync_thread = threading.Thread(target=adaptive_sync_process, name="FileSyncProcess", daemon=True)
                sync_thread.start()
                
                logger.info("[FileSync] Sync process triggered and started")
                return jsonify({'status': 'triggered', 'message': 'File sync process started'})
                
            elif action == 'stop':
                if sync_running:
                    sync_running = False
                    logger.info("[FileSync] Sync process stop requested")
                    return jsonify({'status': 'stopping', 'message': 'Stop signal sent to sync process'})
                else:
                    return jsonify({'status': 'not_running', 'message': 'Sync process is not active'})
                    
            elif action == 'status':
                return jsonify({
                    'status': 'running' if sync_running else 'stopped',
                    'thread_alive': sync_thread.is_alive() if sync_thread else False
                })
            
            else:
                return jsonify({'error': 'Invalid action'}), 400
                
    except Exception as e:
        logger.error(f"[FileSync] Error in trigger endpoint: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health_check():
    """健康检查端点"""
    return jsonify({
        'status': 'healthy',
        'sync_running': sync_running,
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
    })


def start_webhook_server():
    """启动webhook服务器"""
    logger.info("[FileSync] Starting webhook server on port 8090...")
    app.run(host='0.0.0.0', port=8090, debug=False, threaded=True)
