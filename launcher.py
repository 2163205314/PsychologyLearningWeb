import socket
import threading
import webbrowser
from wsgiref.simple_server import make_server

from app import app


def find_available_port(start_port=5000, max_attempts=50):
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(('0.0.0.0', port))
                return port
            except OSError:
                continue
    raise RuntimeError('未找到可用端口')


def get_local_ipv4():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(('8.8.8.8', 80))
            ip = sock.getsockname()[0]
            if ip and not ip.startswith('127.'):
                return ip
    except OSError:
        pass

    try:
        hostname = socket.gethostname()
        addresses = socket.gethostbyname_ex(hostname)[2]
        for ip in addresses:
            if ip and not ip.startswith('127.'):
                return ip
    except OSError:
        pass

    return None


def open_browser(url):
    webbrowser.open(url)


if __name__ == '__main__':
    port = find_available_port()
    local_url = f'http://127.0.0.1:{port}'
    lan_ip = get_local_ipv4()
    lan_url = f'http://{lan_ip}:{port}' if lan_ip else None

    app.config['STARTUP_INFO'] = {
        'port': port,
        'local_url': local_url,
        'lan_ip': lan_ip,
        'lan_url': lan_url
    }

    print('心理学考研学习平台已启动')
    print('本机访问：' + local_url)
    if lan_url:
        print('局域网访问：' + lan_url)
        print('局域网使用说明：保持本机程序运行；局域网设备与本机连接同一网络；首次弹出防火墙提示时请选择允许专用网络访问。')
    else:
        print('未检测到可用局域网 IPv4，当前仅支持本机访问。')

    browser_timer = threading.Timer(1.2, open_browser, args=(local_url,))
    browser_timer.daemon = True
    browser_timer.start()
    server = make_server('0.0.0.0', port, app)
    server.serve_forever()
