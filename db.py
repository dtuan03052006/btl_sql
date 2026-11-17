import os
import pymysql.cursors

def get_db_connection():
    # Hỗ trợ SSL nếu kết nối tới cloud database (Aiven / TiDB Cloud / Railway)
    ssl_config = None
    if os.getenv('DB_SSL', 'false').lower() in ('true', '1', 'yes'):
        ssl_config = {'ssl_mode': 'REQUIRED'}

    return pymysql.connect(
        host=os.getenv('DB_HOST', '127.0.0.1'),
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', '123456'),  
        database=os.getenv('DB_NAME', 'QuanLyNhaHang'),
        port=int(os.getenv('DB_PORT', 3306)),
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=10,
        ssl=ssl_config
    )
