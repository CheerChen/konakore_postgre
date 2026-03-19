# file_sync/utils/aria_utils.py
import json
import requests
import websocket
from .. import config


def send_aria2_request(method, params=None):
    """发送aria2 JSON-RPC请求，支持HTTP和WebSocket"""
    if params is None:
        params = []
    
    # 如果设置了secret，添加到参数开头
    if config.ARIA2_SECRET:
        params.insert(0, f"token:{config.ARIA2_SECRET}")
    
    payload = {
        "jsonrpc": "2.0",
        "id": "qwer",
        "method": method,
        "params": params
    }
    
    try:
        if config.ARIA2_URL.startswith('ws://') or config.ARIA2_URL.startswith('wss://'):
            # WebSocket连接
            print(f"[FileSync] Using WebSocket connection to: {config.ARIA2_URL}")
            ws = websocket.create_connection(config.ARIA2_URL, timeout=10)
            ws.send(json.dumps(payload))
            result_str = ws.recv()
            ws.close()
            
            result = json.loads(result_str)
        else:
            # HTTP连接
            print(f"[FileSync] Using HTTP connection to: {config.ARIA2_URL}")
            response = requests.post(config.ARIA2_URL, json=payload, timeout=10)
            response.raise_for_status()
            result = response.json()
        
        if "error" in result:
            print(f"[FileSync] Aria2 error: {result['error']}")
            return None
        
        return result.get("result")
        
    except Exception as e:
        print(f"[FileSync] Failed to send aria2 request: {e}")
        return None


def validate_download_url(url, expected_size=None):
    """验证下载URL是否可用"""
    try:
        print(f"[FileSync] Validating URL: {url}")
        
        # 发送HEAD请求检查URL
        response = requests.head(url, timeout=10, allow_redirects=True)
        
        if response.status_code != 200:
            print(f"[FileSync] URL validation failed with status {response.status_code}: {url}")
            return False
        
        # 检查Content-Length
        content_length = response.headers.get('content-length')
        if content_length:
            actual_size = int(content_length)
            print(f"[FileSync] URL validated, size: {actual_size} bytes")
            
            return True
        else:
            print(f"[FileSync] No content-length header, but status is 200")
            # 没有content-length但状态是200，可能还是可以下载的
            return True
            
    except Exception as e:
        print(f"[FileSync] URL validation error: {e}")
        return False
