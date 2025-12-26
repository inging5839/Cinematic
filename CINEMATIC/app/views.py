from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.db.models import Q
import json

from .models import Poster, Scene
from .utils import extract_dominant_hue_palette, compute_hsv_summary, get_aggregates_by_level


def index(request):
    """메인 페이지"""
    return render(request, 'index.html')


@csrf_exempt
@require_http_methods(["POST"])
def upload_poster(request):
    """
    포스터 업로드 및 색상 분석
    
    POST /api/poster/upload/
    Form-data: file (이미지 파일)
    
    Returns:
    {
        "success": true,
        "palette": [{"h": 250, "s": 0.62, "v": 0.70}, ...],
        "poster_id": 1
    }
    """
    try:
        if 'file' not in request.FILES:
            return JsonResponse({"success": False, "error": "파일이 없습니다."}, status=400)
        
        file = request.FILES['file']
        
        # 이미지 파일 검증
        if not file.content_type.startswith('image/'):
            return JsonResponse({"success": False, "error": "이미지 파일만 업로드 가능합니다."}, status=400)
        
        # 포스터 저장
        poster = Poster()
        poster.image.save(file.name, ContentFile(file.read()), save=False)
        poster.save()
        
        # 색상 팔레트 추출
        try:
            palette = extract_dominant_hue_palette(poster.image.path)
            poster.palette = palette
            poster.save()
        except Exception as e:
            # 팔레트 추출 실패해도 포스터는 저장
            palette = []
        
        return JsonResponse({
            "success": True,
            "palette": palette,
            "poster_id": poster.id,
            "image_url": poster.image.url
        })
    
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@require_http_methods(["GET"])
def get_poster_palette(request):
    """
    최신 포스터의 팔레트 조회
    
    GET /api/poster/palette/
    
    Returns:
    {
        "palette": [{"h": 250, "s": 0.62, "v": 0.70}, ...],
        "poster_id": 1
    }
    """
    try:
        poster = Poster.objects.order_by('-uploaded_at').first()
        
        if not poster or not poster.palette:
            return JsonResponse({
                "palette": [],
                "poster_id": None
            })
        
        return JsonResponse({
            "palette": poster.palette,
            "poster_id": poster.id,
            "image_url": poster.image.url if poster.image else None
        })
    
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def upload_scene(request):
    """
    영화 장면 업로드 및 HSV 분석
    
    POST /api/scene/upload/
    Form-data:
        - file: 이미지 파일
        - movie_title: 영화 제목
        - positivity_level: 긍부정도 (1-9)
    
    Returns:
    {
        "success": true,
        "scene_id": 1,
        "hsv": {"avgS": 0.5, "avgV": 0.6, "domH": 180}
    }
    """
    try:
        if 'file' not in request.FILES:
            return JsonResponse({"success": False, "error": "파일이 없습니다."}, status=400)
        
        file = request.FILES['file']
        movie_title = request.POST.get('movie_title', '').strip()
        positivity_level = request.POST.get('positivity_level', '').strip()
        
        # 검증
        if not movie_title:
            return JsonResponse({"success": False, "error": "영화 제목을 입력해주세요."}, status=400)
        
        if not positivity_level or not positivity_level.isdigit():
            return JsonResponse({"success": False, "error": "긍부정도(1-9)를 선택해주세요."}, status=400)
        
        positivity_level = int(positivity_level)
        if positivity_level < 1 or positivity_level > 9:
            return JsonResponse({"success": False, "error": "긍부정도는 1-9 사이여야 합니다."}, status=400)
        
        if not file.content_type.startswith('image/'):
            return JsonResponse({"success": False, "error": "이미지 파일만 업로드 가능합니다."}, status=400)
        
        # 장면 저장
        scene = Scene()
        scene.image.save(file.name, ContentFile(file.read()), save=False)
        scene.movie_title = movie_title
        scene.positivity_level = positivity_level
        scene.save()
        
        # HSV 분석
        try:
            hsv_summary = compute_hsv_summary(scene.image.path)
            scene.avg_s = hsv_summary['avgS']
            scene.avg_v = hsv_summary['avgV']
            scene.dom_h = hsv_summary['domH']
            scene.save()
        except Exception as e:
            # HSV 분석 실패해도 장면은 저장
            hsv_summary = {"avgS": None, "avgV": None, "domH": None}
        
        return JsonResponse({
            "success": True,
            "scene_id": scene.id,
            "hsv": hsv_summary,
            "image_url": scene.image.url,
            "created_at": scene.uploaded_at.isoformat()
        })
    
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)


@require_http_methods(["GET"])
def get_statistics(request):
    """
    긍부정도별 통계 데이터 조회
    
    GET /api/statistics/
    Query params:
        - level: 필터링할 긍부정도 (선택사항, 1-9)
    
    Returns:
    {
        "aggregates": {
            "1": {"count": 10, "sMin": 0.2, "sMax": 0.8, ...},
            ...
        }
    }
    """
    try:
        level_filter = request.GET.get('level')
        
        # 장면 쿼리셋
        scenes = Scene.objects.all()
        
        # 레벨 필터 적용
        if level_filter and level_filter.isdigit():
            level = int(level_filter)
            if 1 <= level <= 9:
                scenes = scenes.filter(positivity_level=level)
        
        # 통계 집계
        aggregates = get_aggregates_by_level(scenes)
        
        # JSON 직렬화 가능하도록 변환
        result = {}
        for level, agg in aggregates.items():
            result[str(level)] = {
                "count": agg["count"],
                "sMin": agg["sMin"],
                "sMax": agg["sMax"],
                "vMin": agg["vMin"],
                "vMax": agg["vMax"],
                "sAvg": agg["sAvg"],
                "vAvg": agg["vAvg"]
            }
        
        return JsonResponse({
            "aggregates": result,
            "filter_level": int(level_filter) if level_filter and level_filter.isdigit() else None
        })
    
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@require_http_methods(["GET"])
def get_gallery(request):
    """
    갤러리 데이터 조회
    
    GET /api/gallery/
    Query params:
        - level: 필터링할 긍부정도 (선택사항)
        - search: 영화 제목 검색 (선택사항)
        - sort: 정렬 방식 (newest, oldest, levelHigh, levelLow)
        - page: 페이지 번호 (선택사항, 기본값: 1)
        - page_size: 페이지 크기 (선택사항, 기본값: 50)
    
    Returns:
    {
        "scenes": [...],
        "total": 100,
        "page": 1,
        "page_size": 50
    }
    """
    try:
        # 필터링
        level_filter = request.GET.get('level')
        search_query = request.GET.get('search', '').strip()
        sort_mode = request.GET.get('sort', 'newest')
        page = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('page_size', 50))
        
        scenes = Scene.objects.all()
        
        # 레벨 필터
        if level_filter and level_filter.isdigit():
            level = int(level_filter)
            if 1 <= level <= 9:
                scenes = scenes.filter(positivity_level=level)
        
        # 검색
        if search_query:
            scenes = scenes.filter(movie_title__icontains=search_query)
        
        # 정렬
        if sort_mode == 'newest':
            scenes = scenes.order_by('-uploaded_at')
        elif sort_mode == 'oldest':
            scenes = scenes.order_by('uploaded_at')
        elif sort_mode == 'levelHigh':
            scenes = scenes.order_by('-positivity_level', '-uploaded_at')
        elif sort_mode == 'levelLow':
            scenes = scenes.order_by('positivity_level', '-uploaded_at')
        else:
            scenes = scenes.order_by('-uploaded_at')
        
        # 페이지네이션
        total = scenes.count()
        start = (page - 1) * page_size
        end = start + page_size
        scenes_page = scenes[start:end]
        
        # JSON 직렬화
        scenes_data = []
        for scene in scenes_page:
            scenes_data.append({
                "id": scene.id,
                "title": scene.movie_title,
                "level": scene.positivity_level,
                "image_url": scene.image.url if scene.image else None,
                "hsv": {
                    "avgS": scene.avg_s,
                    "avgV": scene.avg_v,
                    "domH": scene.dom_h
                },
                "created_at": scene.uploaded_at.isoformat()
            })
        
        return JsonResponse({
            "scenes": scenes_data,
            "total": total,
            "page": page,
            "page_size": page_size,
            "has_next": end < total,
            "has_prev": page > 1
        })
    
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@require_http_methods(["GET"])
def export_data(request):
    """
    데이터 내보내기 (JSON)
    
    GET /api/export/
    
    Returns:
    {
        "basePalette": [...],
        "scenes": [...],
        "aggregates": {...}
    }
    """
    try:
        # 최신 포스터 팔레트
        poster = Poster.objects.order_by('-uploaded_at').first()
        base_palette = poster.palette if poster and poster.palette else []
        
        # 모든 장면
        scenes = Scene.objects.all().order_by('-uploaded_at')
        scenes_data = []
        for scene in scenes:
            scenes_data.append({
                "id": scene.id,
                "title": scene.movie_title,
                "level": scene.positivity_level,
                "created_at": scene.uploaded_at.isoformat(),
                "hsv": {
                    "avgS": scene.avg_s,
                    "avgV": scene.avg_v,
                    "domH": scene.dom_h
                }
            })
        
        # 통계
        aggregates = get_aggregates_by_level(Scene.objects.all())
        aggregates_data = {}
        for level, agg in aggregates.items():
            aggregates_data[str(level)] = {
                "count": agg["count"],
                "sMin": agg["sMin"],
                "sMax": agg["sMax"],
                "vMin": agg["vMin"],
                "vMax": agg["vMax"],
                "sAvg": agg["sAvg"],
                "vAvg": agg["vAvg"]
            }
        
        return JsonResponse({
            "basePalette": base_palette,
            "scenes": scenes_data,
            "aggregates": aggregates_data
        })
    
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
