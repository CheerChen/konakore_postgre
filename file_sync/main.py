# file_sync/main.py
import os
from .webhook import start_webhook_server


def start():
    print("File Sync Service starting...")

    print("Starting in webhook mode...")
    start_webhook_server()


if __name__ == "__main__":
    start()
