# file_sync/db.py
import psycopg2
from contextlib import contextmanager
from . import config


@contextmanager
def get_db_connection():
    """Get database connection with context manager"""
    connection = None
    try:
        connection = psycopg2.connect(
            host=config.DB_HOST,
            port=config.DB_PORT,
            database=config.DB_NAME,
            user=config.DB_USER,
            password=config.DB_PASSWORD
        )
        connection.autocommit = True
        yield connection
    except Exception as e:
        if connection:
            connection.rollback()
        raise e
    finally:
        if connection:
            connection.close()
