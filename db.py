import pymysql.cursors

def get_db_connection():
    return pymysql.connect(
        host='127.0.0.1',
        user='root',
        password='123456',  
        database='QuanLyNhaHang',
        port=3306,
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor
    )