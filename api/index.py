import os
import sys

# Thêm thư mục gốc vào sys.path để Vercel serverless function tìm thấy app và db
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
