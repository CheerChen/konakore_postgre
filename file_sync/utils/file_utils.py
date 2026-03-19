# file_sync/utils/file_utils.py
import os
import re
import glob
from .. import config


def get_idx_path(post_id):
    """根据post_id计算idx目录路径"""
    idx = post_id // 10000
    idx_str = f"{idx:02d}"
    return os.path.join(config.DOWNLOAD_BASE_PATH, idx_str)


def ensure_dir(dir_path):
    """确保目录存在"""
    try:
        os.makedirs(dir_path, exist_ok=True)
        return True
    except Exception as e:
        print(f"[FileSync] Failed to create directory {dir_path}: {e}")
        return False


def clean_tags_for_filename(tags):
    """清理和缩短tags用于文件名"""
    if not tags:
        return ""
    
    # 分割tags
    tag_list = tags.split()
    
    # 逐步移除tags直到文件名长度合适
    while len(' '.join(tag_list)) >= config.FILENAME_LENGTH_LIMIT:
        if not tag_list:
            break
        tag_list = tag_list[:-1]
    
    cleaned_tags = ' '.join(tag_list)
    
    # 替换特殊字符
    cleaned_tags = re.sub(r'[\\/:*?"<>|]', '', cleaned_tags)
    
    return cleaned_tags


def build_filename(post_id, tags, url):
    """构建文件名"""
    # 确定文件扩展名
    if 'png' in url.lower():
        ext = 'png'
    else:
        ext = 'jpg'
    
    # 清理tags
    cleaned_tags = clean_tags_for_filename(tags)
    
    # 构建文件名
    if cleaned_tags:
        filename = f"Konachan.com - {post_id} {cleaned_tags}.{ext}"
    else:
        filename = f"Konachan.com - {post_id}.{ext}"
    
    return filename


def check_file_exists(post_id):
    """检查文件是否已存在"""
    idx_dir = get_idx_path(post_id)
    
    if not os.path.exists(idx_dir):
        return None
    
    # 搜索匹配 "Konachan.com - {post_id} *" 的文件
    pattern = os.path.join(idx_dir, f"Konachan.com - {post_id} *")
    matching_files = glob.glob(pattern)
    
    # 也检查没有tags的文件名
    pattern_no_tags = os.path.join(idx_dir, f"Konachan.com - {post_id}.*")
    matching_files.extend(glob.glob(pattern_no_tags))
    
    if matching_files:
        return matching_files[0]  # 返回第一个匹配的文件
    
    return None
