# 🚀 CINEMATIC 배포 가이드

구매한 도메인에 Django 프로젝트를 배포하는 방법을 안내합니다.

## 📋 목차
1. [서버 준비](#1-서버-준비)
2. [도메인 DNS 설정](#2-도메인-dns-설정)
3. [서버 환경 설정](#3-서버-환경-설정)
4. [Django 프로젝트 배포](#4-django-프로젝트-배포)
5. [Nginx & Gunicorn 설정](#5-nginx--gunicorn-설정)
6. [SSL 인증서 설정](#6-ssl-인증서-설정)
7. [환경 변수 설정](#7-환경-변수-설정)

---

## 1. 서버 준비

### 추천 호스팅 서비스
- **AWS EC2** (유연한 확장성)
- **DigitalOcean** (초보자 친화적)
- **Vultr** (저렴한 가격)
- **Linode** (안정적인 성능)
- **Cafe24, Gabia, Hostinger** (국내 서비스)

### 최소 사양
- CPU: 1 Core
- RAM: 1GB
- Storage: 20GB
- OS: Ubuntu 20.04 LTS or later

---

## 2. 도메인 DNS 설정

### A. 도메인 구매처에서 설정 (예: GoDaddy, Namecheap, Gabia 등)

**DNS 레코드 추가:**

```
Type    Host    Value               TTL
A       @       your.server.ip      3600
A       www     your.server.ip      3600
```

**예시:**
```
Type    Host    Value               TTL
A       @       123.45.67.89        3600
A       www     123.45.67.89        3600
```

### B. DNS 전파 확인
DNS 변경 사항이 전파되는 데 최대 24-48시간 소요될 수 있습니다.

```bash
# DNS 확인
nslookup yourdomain.com
dig yourdomain.com
```

---

## 3. 서버 환경 설정

### A. SSH로 서버 접속
```bash
ssh root@your-server-ip
# 또는
ssh ubuntu@your-server-ip
```

### B. 시스템 업데이트
```bash
sudo apt update && sudo apt upgrade -y
```

### C. 필수 패키지 설치
```bash
# Python & Pip
sudo apt install python3 python3-pip python3-venv -y

# Nginx (웹 서버)
sudo apt install nginx -y

# PostgreSQL (권장) 또는 계속 SQLite 사용
# sudo apt install postgresql postgresql-contrib -y

# Git
sudo apt install git -y

# 기타 필수 패키지
sudo apt install build-essential libssl-dev libffi-dev python3-dev -y
```

---

## 4. Django 프로젝트 배포

### A. 프로젝트 디렉토리 생성
```bash
cd /var/www/
sudo mkdir cinematic
sudo chown -R $USER:$USER cinematic
cd cinematic
```

### B. Git으로 프로젝트 가져오기
```bash
# 방법 1: Git 저장소에서 clone
git clone https://github.com/your-username/CINEMATIC.git .

# 방법 2: 로컬에서 파일 업로드
# scp -r D:\03_CAU2502\03_DADV\DADV_final\CINEMATIC/* ubuntu@your-server-ip:/var/www/cinematic/
```

### C. Python 가상 환경 생성
```bash
python3 -m venv venv
source venv/bin/activate
```

### D. 패키지 설치
```bash
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn  # WSGI 서버
```

### E. 환경 변수 설정
```bash
nano .env
```

`.env` 파일 내용:
```bash
DJANGO_SECRET_KEY='your-super-secret-key-here-change-this'
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
```

### F. Django 설정
```bash
# 정적 파일 수집
python manage.py collectstatic --noinput

# 데이터베이스 마이그레이션
python manage.py migrate

# 관리자 계정 생성
python manage.py createsuperuser

# 미디어 폴더 권한 설정
sudo chown -R www-data:www-data media
sudo chmod -R 755 media
```

---

## 5. Nginx & Gunicorn 설정

### A. Gunicorn 서비스 설정

`/etc/systemd/system/cinematic.service` 파일 생성:

```bash
sudo nano /etc/systemd/system/cinematic.service
```

내용:
```ini
[Unit]
Description=CINEMATIC Gunicorn daemon
After=network.target

[Service]
User=ubuntu
Group=www-data
WorkingDirectory=/var/www/cinematic
Environment="PATH=/var/www/cinematic/venv/bin"
EnvironmentFile=/var/www/cinematic/.env
ExecStart=/var/www/cinematic/venv/bin/gunicorn \
          --workers 3 \
          --bind unix:/var/www/cinematic/cinematic.sock \
          CINEMATIC.wsgi:application

[Install]
WantedBy=multi-user.target
```

서비스 시작:
```bash
sudo systemctl start cinematic
sudo systemctl enable cinematic
sudo systemctl status cinematic
```

### B. Nginx 설정

`/etc/nginx/sites-available/cinematic` 파일 생성:

```bash
sudo nano /etc/nginx/sites-available/cinematic
```

내용:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    client_max_body_size 10M;

    location = /favicon.ico { 
        access_log off; 
        log_not_found off; 
    }

    location /static/ {
        alias /var/www/cinematic/staticfiles/;
    }

    location /media/ {
        alias /var/www/cinematic/media/;
    }

    location / {
        include proxy_params;
        proxy_pass http://unix:/var/www/cinematic/cinematic.sock;
    }
}
```

심볼릭 링크 생성 및 Nginx 재시작:
```bash
sudo ln -s /etc/nginx/sites-available/cinematic /etc/nginx/sites-enabled/
sudo nginx -t  # 설정 테스트
sudo systemctl restart nginx
```

---

## 6. SSL 인증서 설정 (Let's Encrypt)

### A. Certbot 설치
```bash
sudo apt install certbot python3-certbot-nginx -y
```

### B. SSL 인증서 발급
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

이메일 입력 → 약관 동의 → 자동으로 Nginx 설정 업데이트

### C. 자동 갱신 테스트
```bash
sudo certbot renew --dry-run
```

---

## 7. 환경 변수 설정

### `.env` 파일 예시
```bash
# Security
DJANGO_SECRET_KEY='your-secret-key-here'
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com,123.45.67.89

# Database (PostgreSQL 사용 시)
# DB_ENGINE=django.db.backends.postgresql
# DB_NAME=cinematic_db
# DB_USER=cinematic_user
# DB_PASSWORD=your-db-password
# DB_HOST=localhost
# DB_PORT=5432
```

---

## 🔧 유지보수 명령어

### 서비스 관리
```bash
# Gunicorn 재시작
sudo systemctl restart cinematic

# Nginx 재시작
sudo systemctl restart nginx

# 로그 확인
sudo journalctl -u cinematic -f
sudo tail -f /var/log/nginx/error.log
```

### 코드 업데이트
```bash
cd /var/www/cinematic
git pull origin main
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
sudo systemctl restart cinematic
```

---

## 🚨 트러블슈팅

### 1. 502 Bad Gateway
```bash
# Gunicorn이 실행 중인지 확인
sudo systemctl status cinematic

# 소켓 파일 확인
ls -l /var/www/cinematic/cinematic.sock

# Gunicorn 로그 확인
sudo journalctl -u cinematic -n 50
```

### 2. 정적 파일이 로드되지 않음
```bash
python manage.py collectstatic --noinput
sudo chown -R www-data:www-data staticfiles
sudo systemctl restart nginx
```

### 3. 이미지 업로드 실패
```bash
sudo chown -R www-data:www-data media
sudo chmod -R 755 media
```

---

## 📱 빠른 설정 (원클릭 스크립트)

전체 과정을 자동화한 스크립트: `deploy.sh` 참조

```bash
chmod +x deploy.sh
./deploy.sh yourdomain.com
```

---

## 🎉 완료!

이제 브라우저에서 `https://yourdomain.com` 접속하여 확인하세요!

**관리자 페이지**: `https://yourdomain.com/admin`

---

## 📞 추가 지원

문제가 발생하면:
1. Nginx 로그: `/var/log/nginx/error.log`
2. Gunicorn 로그: `sudo journalctl -u cinematic`
3. Django 로그: 프로젝트의 `logs/` 디렉토리

