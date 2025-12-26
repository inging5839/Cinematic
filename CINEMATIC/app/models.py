from django.db import models
import os


class Poster(models.Model):
    """포스터 이미지 및 색상 팔레트 정보"""
    image = models.ImageField(upload_to='posters/')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    # 색상 팔레트 (JSON 형태로 저장)
    # 예: [{"h": 250, "s": 0.62, "v": 0.70}, ...]
    palette = models.JSONField(default=list, blank=True)
    
    class Meta:
        ordering = ['-uploaded_at']
    
    def __str__(self):
        return f"Poster {self.id} - {self.uploaded_at}"


class Scene(models.Model):
    """영화 장면 이미지 및 긍부정도 정보"""
    POSITIVITY_LEVELS = [(i, str(i)) for i in range(1, 10)]
    
    image = models.ImageField(upload_to='scenes/')
    movie_title = models.CharField(max_length=200)
    positivity_level = models.IntegerField(choices=POSITIVITY_LEVELS)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    # HSV 분석 결과
    avg_s = models.FloatField(null=True, blank=True, help_text="Average Saturation")
    avg_v = models.FloatField(null=True, blank=True, help_text="Average Value")
    dom_h = models.IntegerField(null=True, blank=True, help_text="Dominant Hue (0-359)")
    
    class Meta:
        ordering = ['-uploaded_at']
        indexes = [
            models.Index(fields=['positivity_level']),
            models.Index(fields=['movie_title']),
        ]
    
    def __str__(self):
        return f"{self.movie_title} - Level {self.positivity_level}"

