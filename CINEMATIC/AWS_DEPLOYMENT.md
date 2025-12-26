# ☁️ AWS EC2 배포 가이드 - CINEMATIC

## 📋 목차
1. [AWS EC2 인스턴스 생성](#1-aws-ec2-인스턴스-생성)
2. [도메인 연결](#2-도메인-연결-route-53-또는-외부-dns)
3. [서버 접속 및 설정](#3-서버-접속-및-설정)
4. [프로젝트 배포](#4-프로젝트-배포)
5. [SSL 인증서 설정](#5-ssl-인증서-설정)
6. [문제 해결](#6-문제-해결)

---

## 1. AWS EC2 인스턴스 생성

### A. AWS 콘솔 로그인
1. https://console.aws.amazon.com 접속
2. **서비스 → EC2** 클릭

### B. EC2 인스턴스 시작

#### **1단계: AMI(Amazon Machine Image) 선택**
```
✅ Ubuntu Server 22.04 LTS (HVM), SSD Volume Type
   - 64비트(x86)
   - 프리 티어 사용 가능
```

#### **2단계: 인스턴스 유형 선택**
```
프리 티어 (무료):
✅ t2.micro (1 vCPU, 1GB RAM) - 프리 티어

또는 추천 (유료):
⭐ t3.small (2 vCPU, 2GB RAM) - $15/월
⭐ t3.medium (2 vCPU, 4GB RAM) - $30/월
```

#### **3단계: 인스턴스 세부 정보**
```
- 인스턴스 개수: 1
- 나머지: 기본값 유지
```

#### **4단계: 스토리지 추가**
```
✅ 크기: 20 GB (프리 티어는 30GB까지 무료)
✅ 볼륨 유형: 범용 SSD (GP3)
```

#### **5단계: 태그 추가**
```
키: Name
값: CINEMATIC-Server
```

#### **6단계: 보안 그룹 구성** ⚠️ **중요!**
```
새 보안 그룹 생성: cinematic-security-group

규칙 추가:
┌──────┬─────────┬──────────┬─────────────────┐
│ 유형  │ 프로토콜 │ 포트 범위 │ 소스            │
├──────┼─────────┼──────────┼─────────────────┤
│ SSH  │ TCP     │ 22       │ 내 IP (권장)    │
│ HTTP │ TCP     │ 80       │ 0.0.0.0/0       │
│ HTTPS│ TCP     │ 443      │ 0.0.0.0/0       │
└──────┴─────────┴──────────┴─────────────────┘
```

#### **7단계: 검토 및 시작**
- **키 페어 생성/선택**:
  ```
  새 키 페어 생성
  키 페어 이름: cinematic-key
  키 페어 유형: RSA
  파일 형식: .pem (Mac/Linux) 또는 .ppk (Windows PuTTY)
  
  ⬇️ 다운로드 후 안전한 곳에 보관!
  ```

- **인스턴스 시작** 클릭

### C. 탄력적 IP(Elastic IP) 할당 ⚠️ **중요!**

> **왜 필요?** 인스턴스 재시작 시 IP가 변경되는 것을 방지

1. EC2 콘솔 → **네트워크 및 보안 → 탄력적 IP**
2. **탄력적 IP 주소 할당** 클릭
3. **할당** 클릭
4. 할당된 IP 선택 → **작업 → 탄력적 IP 주소 연결**
5. 인스턴스 선택 → **연결** 클릭

```
✅ 탄력적 IP: 123.45.67.89 (예시)
```

---

## 2. 도메인 연결 (Route 53 또는 외부 DNS)

### 옵션 A: AWS Route 53 사용

#### 1. Route 53 호스팅 영역 생성
```
1. AWS 콘솔 → Route 53 → 호스팅 영역
2. 호스팅 영역 생성 클릭
3. 도메인 이름: yourdomain.com
4. 유형: 퍼블릭 호스팅 영역
```

#### 2. 레코드 생성
```
레코드 1:
- 레코드 이름: (비워두기)
- 레코드 유형: A
- 값: 123.45.67.89 (탄력적 IP)
- TTL: 300

레코드 2:
- 레코드 이름: www
- 레코드 유형: A
- 값: 123.45.67.89 (탄력적 IP)
- TTL: 300
```

#### 3. 도메인 등록기관에서 네임서버 변경
```
Route 53 호스팅 영역에서 NS 레코드 확인:
ns-1234.awsdns-12.org
ns-5678.awsdns-56.co.uk
ns-910.awsdns-91.com
ns-1112.awsdns-11.net

→ 도메인 구매한 곳(GoDaddy 등)에서 네임서버를 위 4개로 변경
```

### 옵션 B: 외부 DNS 사용 (GoDaddy, Namecheap 등)

도메인 구매처 DNS 관리 페이지에서:
```
Type    Host    Value               TTL
A       @       123.45.67.89        3600
A       www     123.45.67.89        3600
```

---

## 3. 서버 접속 및 설정

### A. SSH 키 권한 설정 (로컬 PC)

#### Windows (PowerShell):
```powershell
# 키 파일 위치로 이동
cd C:\Users\YourName\Downloads

# SSH 접속
ssh -i "cinematic-key.pem" ubuntu@123.45.67.89
```

#### Mac/Linux:
```bash
# 키 파일 권한 변경
chmod 400 cinematic-key.pem

# SSH 접속
ssh -i cinematic-key.pem ubuntu@123.45.67.89
```

### B. 서버 초기 설정

```bash
# 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# 타임존 설정
sudo timedatectl set-timezone Asia/Seoul

# 한국어 로케일 설정 (선택사항)
sudo locale-gen ko_KR.UTF-8

# Swap 메모리 추가 (t2.micro는 RAM 1GB로 부족할 수 있음)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 4. 프로젝트 배포

### A. 파일 업로드 (로컬 PC → EC2)

#### 방법 1: SCP 사용
```bash
# Windows PowerShell / Mac Terminal
cd D:\03_CAU2502\03_DADV\DADV_final\CINEMATIC

# 전체 프로젝트 업로드
scp -i "cinematic-key.pem" -r . ubuntu@123.45.67.89:~/cinematic/
```

#### 방법 2: Git 사용 (추천)
```bash
# 로컬에서 Git 저장소에 푸시
git add .
git commit -m "Deploy to AWS"
git push origin main

# EC2 서버에서:
git clone https://github.com/your-username/CINEMATIC.git cinematic
```

### B. 서버에서 프로젝트 이동
```bash
# SSH 접속 상태에서
sudo mkdir -p /var/www/cinematic
sudo mv ~/cinematic/* /var/www/cinematic/
sudo chown -R ubuntu:ubuntu /var/www/cinematic
cd /var/www/cinematic
```

### C. 자동 배포 스크립트 실행
```bash
# 실행 권한 부여
chmod +x deploy.sh

# 배포 실행 (본인 도메인으로 변경)
./deploy.sh yourdomain.com
```

스크립트가 자동으로:
- ✅ Python, Nginx 설치
- ✅ 가상 환경 생성
- ✅ Django 설정
- ✅ Gunicorn 서비스 시작
- ✅ Nginx 웹 서버 설정

### D. 관리자 계정 생성
```bash
cd /var/www/cinematic
source venv/bin/activate
python manage.py createsuperuser

# 입력:
# Username: admin
# Email: your-email@example.com
# Password: (비밀번호 입력)
```

---

## 5. SSL 인증서 설정 (HTTPS)

### Let's Encrypt 무료 SSL 인증서

```bash
# Certbot 설치
sudo apt install certbot python3-certbot-nginx -y

# SSL 인증서 발급 및 자동 설정
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# 입력 사항:
# Email: your-email@example.com
# Terms of Service: Y (동의)
# Share email: N (선택)
# Redirect HTTP to HTTPS: 2 (선택 - 추천)
```

### 자동 갱신 설정 (인증서는 90일 유효)
```bash
# 갱신 테스트
sudo certbot renew --dry-run

# Cron 작업 확인 (자동으로 설정됨)
sudo systemctl status certbot.timer
```

---

## 6. 문제 해결

### A. 연결 안 됨 (Connection Timeout)

#### 1. 보안 그룹 확인
```bash
EC2 콘솔 → 인스턴스 선택 → 보안 → 보안 그룹
→ 인바운드 규칙에 80, 443 포트가 0.0.0.0/0로 열려있는지 확인
```

#### 2. Nginx 상태 확인
```bash
sudo systemctl status nginx
sudo systemctl restart nginx
```

### B. 502 Bad Gateway

```bash
# Gunicorn 상태 확인
sudo systemctl status cinematic

# 재시작
sudo systemctl restart cinematic

# 로그 확인
sudo journalctl -u cinematic -n 50
```

### C. Static 파일 안 보임

```bash
cd /var/www/cinematic
source venv/bin/activate
python manage.py collectstatic --noinput
sudo systemctl restart nginx
```

### D. 이미지 업로드 실패

```bash
cd /var/www/cinematic
sudo chown -R www-data:www-data media
sudo chmod -R 755 media
```

### E. 메모리 부족 (t2.micro)

```bash
# Swap 확인
free -h

# Swap 추가 (이미 했다면 스킵)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

## 📊 서버 모니터링

### 실시간 로그 확인
```bash
# Nginx 에러 로그
sudo tail -f /var/log/nginx/error.log

# Django 앱 로그
sudo journalctl -u cinematic -f

# 시스템 리소스 확인
htop  # 또는 top
```

### 서비스 상태 확인
```bash
# 모든 서비스 상태
sudo systemctl status nginx cinematic

# 개별 확인
sudo systemctl status nginx
sudo systemctl status cinematic
```

---

## 🔄 업데이트 배포

### Git 사용 시
```bash
cd /var/www/cinematic
git pull origin main
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
sudo systemctl restart cinematic
```

### 파일 직접 업로드 시
```bash
# 로컬 PC에서
scp -i "cinematic-key.pem" -r . ubuntu@123.45.67.89:/var/www/cinematic/

# 서버에서
cd /var/www/cinematic
source venv/bin/activate
python manage.py collectstatic --noinput
python manage.py migrate
sudo systemctl restart cinematic
```

---

## 💰 AWS 비용 최적화

### 프리 티어 (12개월 무료)
- **EC2**: t2.micro 750시간/월
- **EBS**: 30GB
- **데이터 전송**: 15GB/월

### 프리 티어 이후 예상 비용
```
EC2 t2.micro: ~$8/월
EBS 20GB: ~$2/월
탄력적 IP: $0 (인스턴스 실행 중)
합계: ~$10/월
```

### 비용 절감 팁
1. **예약 인스턴스**: 1년 약정 시 최대 40% 할당
2. **스팟 인스턴스**: 최대 90% 할인 (개발용)
3. **인스턴스 중지**: 사용하지 않을 때 중지 (EBS 비용만 발생)

---

## 🎉 완료 체크리스트

```
✅ EC2 인스턴스 생성 (Ubuntu 22.04)
✅ 탄력적 IP 할당
✅ 보안 그룹 설정 (22, 80, 443 포트)
✅ SSH 키로 서버 접속
✅ 도메인 DNS 설정 (A 레코드)
✅ 프로젝트 파일 업로드
✅ deploy.sh 스크립트 실행
✅ SSL 인증서 설정 (Let's Encrypt)
✅ 관리자 계정 생성
✅ 사이트 접속 확인
```

---

## 📱 접속 확인

1. **웹사이트**: `https://yourdomain.com`
2. **관리자**: `https://yourdomain.com/admin`
3. **서버 IP**: `http://123.45.67.89` (도메인 전파 전)

---

## 🆘 지원

**문제 발생 시:**
1. 서버 로그 확인: `sudo journalctl -u cinematic -f`
2. Nginx 로그: `sudo tail -f /var/log/nginx/error.log`
3. 서비스 재시작: `sudo systemctl restart cinematic nginx`

**AWS 지원:**
- AWS Support Center
- AWS 문서: https://docs.aws.amazon.com/

---

## 🚀 성공!

축하합니다! AWS EC2에 CINEMATIC이 배포되었습니다!

**다음 단계:**
- CloudFront CDN 설정 (속도 향상)
- RDS 데이터베이스 사용 (확장성)
- S3로 미디어 파일 관리
- CloudWatch로 모니터링


