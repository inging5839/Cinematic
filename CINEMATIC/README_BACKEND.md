# Cinematic Emotion Lab - Backend API

Django 프레임워크 기반 백엔드 API 문서입니다.

## 설치 및 설정

### 1. 가상환경 설정 (선택사항)
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

### 2. 패키지 설치
```bash
pip install -r requirements.txt
```

### 3. 데이터베이스 마이그레이션
```bash
python manage.py makemigrations
python manage.py migrate
```

### 4. 관리자 계정 생성 (선택사항)
```bash
python manage.py createsuperuser
```

### 5. 서버 실행
```bash
python manage.py runserver
```

## API 엔드포인트

### 1. 포스터 업로드 및 분석
**POST** `/api/poster/upload/`

포스터 이미지를 업로드하고 색상 팔레트를 추출합니다.

**Request:**
- Form-data:
  - `file`: 이미지 파일 (jpg, png 등)

**Response:**
```json
{
  "success": true,
  "palette": [
    {"h": 250, "s": 0.62, "v": 0.70},
    {"h": 285, "s": 0.58, "v": 0.70}
  ],
  "poster_id": 1,
  "image_url": "/media/posters/poster.jpg"
}
```

### 2. 포스터 팔레트 조회
**GET** `/api/poster/palette/`

최신 포스터의 색상 팔레트를 조회합니다.

**Response:**
```json
{
  "palette": [
    {"h": 250, "s": 0.62, "v": 0.70}
  ],
  "poster_id": 1,
  "image_url": "/media/posters/poster.jpg"
}
```

### 3. 장면 업로드
**POST** `/api/scene/upload/`

영화 장면 이미지를 업로드하고 HSV 분석을 수행합니다.

**Request:**
- Form-data:
  - `file`: 이미지 파일
  - `movie_title`: 영화 제목 (문자열)
  - `positivity_level`: 긍부정도 (1-9, 정수)

**Response:**
```json
{
  "success": true,
  "scene_id": 1,
  "hsv": {
    "avgS": 0.5,
    "avgV": 0.6,
    "domH": 180
  },
  "image_url": "/media/scenes/scene.jpg",
  "created_at": "2024-01-01T12:00:00Z"
}
```

### 4. 통계 데이터 조회
**GET** `/api/statistics/`

긍부정도별 HSV 통계를 조회합니다.

**Query Parameters:**
- `level`: 필터링할 긍부정도 (선택사항, 1-9)

**Response:**
```json
{
  "aggregates": {
    "1": {
      "count": 10,
      "sMin": 0.2,
      "sMax": 0.8,
      "vMin": 0.3,
      "vMax": 0.9,
      "sAvg": 0.5,
      "vAvg": 0.6
    },
    "2": { ... },
    ...
  },
  "filter_level": null
}
```

### 5. 갤러리 조회
**GET** `/api/gallery/`

업로드된 장면들을 갤러리 형식으로 조회합니다.

**Query Parameters:**
- `level`: 필터링할 긍부정도 (선택사항)
- `search`: 영화 제목 검색 (선택사항)
- `sort`: 정렬 방식 (newest, oldest, levelHigh, levelLow)
- `page`: 페이지 번호 (기본값: 1)
- `page_size`: 페이지 크기 (기본값: 50)

**Response:**
```json
{
  "scenes": [
    {
      "id": 1,
      "title": "Titanic",
      "level": 5,
      "image_url": "/media/scenes/scene.jpg",
      "hsv": {
        "avgS": 0.5,
        "avgV": 0.6,
        "domH": 180
      },
      "created_at": "2024-01-01T12:00:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "page_size": 50,
  "has_next": true,
  "has_prev": false
}
```

### 6. 데이터 내보내기
**GET** `/api/export/`

모든 데이터를 JSON 형식으로 내보냅니다.

**Response:**
```json
{
  "basePalette": [...],
  "scenes": [...],
  "aggregates": {...}
}
```

## 데이터 모델

### Poster (포스터)
- `image`: 이미지 파일
- `uploaded_at`: 업로드 시간
- `palette`: 색상 팔레트 (JSON)

### Scene (장면)
- `image`: 이미지 파일
- `movie_title`: 영화 제목
- `positivity_level`: 긍부정도 (1-9)
- `uploaded_at`: 업로드 시간
- `avg_s`: 평균 Saturation
- `avg_v`: 평균 Value
- `dom_h`: 주요 Hue (0-359)

## 파일 구조

```
CINEMATIC/
├── app/
│   ├── models.py          # 데이터 모델
│   ├── views.py           # API 뷰
│   ├── utils.py           # HSV 분석 유틸리티
│   ├── admin.py           # Django 관리자
│   └── templates/
│       └── index.html     # 프론트엔드
├── CINEMATIC/
│   ├── settings.py        # Django 설정
│   └── urls.py            # URL 라우팅
└── manage.py
```

## 주의사항

1. **미디어 파일**: 업로드된 이미지는 `media/` 폴더에 저장됩니다.
2. **CSRF**: 개발 환경에서는 `@csrf_exempt` 데코레이터를 사용했습니다. 프로덕션에서는 CSRF 토큰을 사용해야 합니다.
3. **이미지 처리**: OpenCV와 PIL을 사용하여 HSV 분석을 수행합니다.

