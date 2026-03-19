# file_sync/config.py
import os

# Database Configuration
DB_HOST = os.getenv('POSTGRES_HOST', 'postgres')
DB_PORT = os.getenv('POSTGRES_PORT', '5432')
DB_NAME = os.getenv('POSTGRES_DB', 'konakore')
DB_USER = os.getenv('POSTGRES_USER', 'konakore')
DB_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'secret')

# File Sync Configuration
ARIA2_URL = os.getenv('ARIA2_URL', 'http://localhost:6800/jsonrpc')
ARIA2_SECRET = os.getenv('ARIA2_SECRET', '')
DOWNLOAD_BASE_PATH = os.getenv('DOWNLOAD_BASE_PATH', '/wallpaper')
FILENAME_LENGTH_LIMIT = 200  # 文件名长度限制
