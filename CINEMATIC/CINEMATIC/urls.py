from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from app import views

urlpatterns = [
    path('', views.index, name='index'),
    
    # API endpoints
    path('api/poster/upload/', views.upload_poster, name='upload_poster'),
    path('api/poster/palette/', views.get_poster_palette, name='get_poster_palette'),
    path('api/scene/upload/', views.upload_scene, name='upload_scene'),
    path('api/statistics/', views.get_statistics, name='get_statistics'),
    path('api/statistics/correlation/', views.get_correlation_analysis, name='get_correlation'),
    path('api/gallery/', views.get_gallery, name='get_gallery'),
    path('api/export/', views.export_data, name='export_data'),
    path('api/export/scenes-csv/', views.export_scenes_csv, name='export_scenes_csv'),
    path('api/export/aggregates-csv/', views.export_aggregates_csv, name='export_aggregates_csv'),
]

# 개발 환경에서 미디어 파일 서빙
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
