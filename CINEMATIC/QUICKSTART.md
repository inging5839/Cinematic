# ⚡ 빠른 시작 가이드

## 🎯 목표
구매한 도메인(예: `mycinematic.com`)에 CINEMATIC을 5분 안에 배포하기!

---

## 📝 사전 준비

### 1. **도메인** 구매 완료 ✅
- GoDaddy, Namecheap, Gabia, Cafe24 등에서 구매

### 2. **서버** (VPS) 준비
추천 옵션:
- **AWS EC2** (프리티어 1년 무료)
- **DigitalOcean** ($5/월)
- **Vultr** ($5/월)
- **Cafe24 호스팅** (국내)

### 3. **서버 정보** 확인
- 서버 IP 주소: `123.45.67.89`
- SSH 접속: `ssh ubuntu@123.45.67.89`

---

## 🚀 3단계 배포

### STEP 1: 도메인 DNS 설정 (5분)

**도메인 구매처 관리 페이지 접속** → DNS 설정

```
Type    이름     값 (Value)         TTL
A       @       123.45.67.89      3600
A       www     123.45.67.89      3600
```

> **설명:**
> - `@` = 메인 도메인 (mycinematic.com)
> - `www` = www 서브도메인 (www.mycinematic.com)
> - `123.45.67.89` = 서버 IP 주소로 변경

**DNS 전파 확인 (10-30분 소요):**
```bash
ping mycinematic.com
```

---

### STEP 2: 서버에 프로젝트 업로드 (10분)

#### A. 로컬에서 파일 압축
```bash
# Windows PowerShell
cd D:\03_CAU2502\03_DADV\DADV_final
tar -czf cinematic.tar.gz CINEMATIC/
```

#### B. 서버로 업로드
```bash
# 로컬 PC에서 실행
scp cinematic.tar.gz ubuntu@123.45.67.89:~/
```

#### C. 서버에서 압축 해제
```bash
# 서버 SSH 접속 후
ssh ubuntu@123.45.67.89

cd /var/www
sudo mkdir cinematic
sudo chown -R ubuntu:ubuntu cinematic
cd cinematic
tar -xzf ~/cinematic.tar.gz --strip-components=1
```

---

### STEP 3: 자동 배포 스크립트 실행 (5분)

```bash
cd /var/www/cinematic

# 스크립트 실행 권한 부여
chmod +x deploy.sh

# 배포 실행 (도메인 입력)
./deploy.sh mycinematic.com
```

스크립트가 자동으로:
- ✅ Python & Nginx 설치
- ✅ 가상 환경 생성
- ✅ Django 설정
- ✅ Gunicorn 서비스 시작
- ✅ Nginx 웹 서버 설정

---

## 🔐 STEP 4: SSL 인증서 (HTTPS) 설정 (3분)

```bash
# Let's Encrypt 설치
sudo apt install certbot python3-certbot-nginx -y

# SSL 인증서 자동 발급 및 설정
sudo certbot --nginx -d mycinematic.com -d www.mycinematic.com
```

이메일 입력 → 약관 동의(Y) → 완료!

---

## 🎉 완료!

### ✅ 확인하기
1. **웹사이트**: `https://mycinematic.com` 접속
2. **관리자**: `https://mycinematic.com/admin`

### 🔑 관리자 계정 생성
```bash
cd /var/www/cinematic
source venv/bin/activate
python manage.py createsuperuser
```

---

## 🔧 유지보수

### 코드 업데이트
```bash
cd /var/www/cinematic
git pull  # Git 사용 시
# 또는 새 파일 업로드

source venv/bin/activate
python manage.py migrate
python manage.py collectstatic --noinput
sudo systemctl restart cinematic
```

### 서비스 상태 확인
```bash
# 웹 서버 상태
sudo systemctl status nginx

# Django 앱 상태
sudo systemctl status cinematic

# 로그 확인
sudo journalctl -u cinematic -f
```

### 서비스 재시작
```bash
sudo systemctl restart cinematic
sudo systemctl restart nginx
```

---

## ❓ 문제 해결

### 1. **사이트에 접속 안 됨**
```bash
# DNS 확인
ping mycinematic.com

# 방화벽 확인
sudo ufw status
sudo ufw allow 'Nginx Full'
```

### 2. **502 Bad Gateway**
```bash
# Gunicorn 재시작
sudo systemctl restart cinematic

# 로그 확인
sudo journalctl -u cinematic -n 50
```

### 3. **정적 파일 (CSS/JS) 안 보임**
```bash
cd /var/www/cinematic
source venv/bin/activate
python manage.py collectstatic --noinput
sudo systemctl restart nginx
```

### 4. **이미지 업로드 안 됨**
```bash
cd /var/www/cinematic
sudo chown -R www-data:www-data media
sudo chmod -R 755 media
```

---

## 📞 도움말

더 자세한 내용은 `DEPLOYMENT_GUIDE.md` 참조

**빠른 지원:**
- Nginx 에러 로그: `sudo tail -f /var/log/nginx/error.log`
- Django 로그: `sudo journalctl -u cinematic -f`
- 서버 상태: `sudo systemctl status cinematic nginx`

---

## 🎊 축하합니다!

이제 `https://mycinematic.com`에서 CINEMATIC이 실행됩니다! 🚀

