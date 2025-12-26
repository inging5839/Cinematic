#!/bin/bash

# CINEMATIC 자동 배포 스크립트
# 사용법: ./deploy.sh yourdomain.com

set -e  # 에러 발생 시 스크립트 중단

DOMAIN=$1
PROJECT_DIR="/var/www/cinematic"
USER=$(whoami)

if [ -z "$DOMAIN" ]; then
    echo "❌ 사용법: ./deploy.sh yourdomain.com"
    exit 1
fi

echo "🚀 CINEMATIC 배포를 시작합니다..."
echo "📍 도메인: $DOMAIN"
echo "📁 프로젝트 경로: $PROJECT_DIR"
echo ""

# 1. 시스템 업데이트
echo "📦 시스템 패키지 업데이트 중..."
sudo apt update && sudo apt upgrade -y

# 2. 필수 패키지 설치
echo "📦 필수 패키지 설치 중..."
sudo apt install -y \
    python3 \
    python3-pip \
    python3-venv \
    nginx \
    git \
    build-essential \
    libssl-dev \
    libffi-dev \
    python3-dev

# 3. 프로젝트 디렉토리 생성
echo "📁 프로젝트 디렉토리 설정 중..."
if [ ! -d "$PROJECT_DIR" ]; then
    sudo mkdir -p $PROJECT_DIR
    sudo chown -R $USER:$USER $PROJECT_DIR
fi

cd $PROJECT_DIR

# 4. Python 가상 환경 생성
echo "🐍 Python 가상 환경 생성 중..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate

# 5. 패키지 설치
echo "📦 Python 패키지 설치 중..."
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn

# 6. 환경 변수 파일 생성
echo "⚙️  환경 변수 설정 중..."
if [ ! -f ".env" ]; then
    cat > .env << EOF
DJANGO_SECRET_KEY='$(python3 -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())')'
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=$DOMAIN,www.$DOMAIN
EOF
    echo "✅ .env 파일이 생성되었습니다."
else
    echo "ℹ️  .env 파일이 이미 존재합니다."
fi

# 7. Django 설정
echo "🔧 Django 설정 중..."
python manage.py collectstatic --noinput
python manage.py migrate

# 8. 미디어 폴더 권한 설정
echo "🔐 폴더 권한 설정 중..."
mkdir -p media staticfiles
sudo chown -R www-data:www-data media
sudo chmod -R 755 media

# 9. Gunicorn 서비스 생성
echo "🦄 Gunicorn 서비스 설정 중..."
sudo tee /etc/systemd/system/cinematic.service > /dev/null << EOF
[Unit]
Description=CINEMATIC Gunicorn daemon
After=network.target

[Service]
User=$USER
Group=www-data
WorkingDirectory=$PROJECT_DIR
Environment="PATH=$PROJECT_DIR/venv/bin"
EnvironmentFile=$PROJECT_DIR/.env
ExecStart=$PROJECT_DIR/venv/bin/gunicorn \\
          --workers 3 \\
          --bind unix:$PROJECT_DIR/cinematic.sock \\
          CINEMATIC.wsgi:application

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl start cinematic
sudo systemctl enable cinematic

# 10. Nginx 설정
echo "🌐 Nginx 설정 중..."
sudo tee /etc/nginx/sites-available/cinematic > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    client_max_body_size 10M;

    location = /favicon.ico { 
        access_log off; 
        log_not_found off; 
    }

    location /static/ {
        alias $PROJECT_DIR/staticfiles/;
    }

    location /media/ {
        alias $PROJECT_DIR/media/;
    }

    location / {
        include proxy_params;
        proxy_pass http://unix:$PROJECT_DIR/cinematic.sock;
    }
}
EOF

# Nginx 심볼릭 링크
if [ ! -L "/etc/nginx/sites-enabled/cinematic" ]; then
    sudo ln -s /etc/nginx/sites-available/cinematic /etc/nginx/sites-enabled/
fi

# 기본 Nginx 설정 제거
if [ -L "/etc/nginx/sites-enabled/default" ]; then
    sudo rm /etc/nginx/sites-enabled/default
fi

# Nginx 테스트 및 재시작
sudo nginx -t
sudo systemctl restart nginx

# 11. 방화벽 설정
echo "🔥 방화벽 설정 중..."
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH

# 12. SSL 인증서 설치
echo "🔒 SSL 인증서 설정..."
echo "다음 명령어를 실행하여 SSL을 설정하세요:"
echo "sudo apt install certbot python3-certbot-nginx -y"
echo "sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"

echo ""
echo "✅ =========================================="
echo "✅ 배포가 완료되었습니다!"
echo "✅ =========================================="
echo ""
echo "📍 사이트 주소: http://$DOMAIN"
echo "📍 관리자 페이지: http://$DOMAIN/admin"
echo ""
echo "🔒 SSL 인증서를 설정하려면:"
echo "   sudo apt install certbot python3-certbot-nginx -y"
echo "   sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""
echo "👤 관리자 계정을 생성하려면:"
echo "   cd $PROJECT_DIR"
echo "   source venv/bin/activate"
echo "   python manage.py createsuperuser"
echo ""
echo "📊 서비스 상태 확인:"
echo "   sudo systemctl status cinematic"
echo "   sudo systemctl status nginx"
echo ""

