from django.contrib import admin
from .models import Poster, Scene


@admin.register(Poster)
class PosterAdmin(admin.ModelAdmin):
    list_display = ['id', 'uploaded_at', 'palette_preview']
    readonly_fields = ['uploaded_at']
    
    def palette_preview(self, obj):
        if obj.palette:
            return f"{len(obj.palette)} colors"
        return "No palette"
    palette_preview.short_description = "Palette"


@admin.register(Scene)
class SceneAdmin(admin.ModelAdmin):
    list_display = ['id', 'movie_title', 'positivity_level', 'uploaded_at', 'avg_s', 'avg_v']
    list_filter = ['positivity_level', 'uploaded_at']
    search_fields = ['movie_title']
    readonly_fields = ['uploaded_at']

