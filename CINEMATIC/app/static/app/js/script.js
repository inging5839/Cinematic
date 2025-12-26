(() => {
  // ---------- DOM (will be initialized after DOM is ready) ----------
  let posterInput, posterFileName, analyzePosterBtn, posterStatus;
  let posterPreviewImg, posterPreviewFrame, posterPaletteRow;
  let orbitWrap, orbitSvg;
  let sceneForm, movieTitleInput, positivitySelect, sceneInput;
  let sceneFileName, sceneStatus, scenePreviewImg, scenePreviewFrame, sceneSelectedBadge;
  let svTableBody, countChart, svChart;
  let galleryGrid, galleryEmpty, gallerySearch, gallerySort, galleryFilterChip, galleryLoading;
  let exportJsonBtn, resetAllBtn, backToTopBtn;
  let workCanvas, wctx;

  // ---------- STATE ----------
  const LS_KEY = "celab_v1";
  const DEFAULT_BASE_PALETTE = [
    // fallback if no poster (10 colors for full spectrum coverage)
    { h: 0,   s: 0.60, v: 0.70 }, // red
    { h: 30,  s: 0.55, v: 0.72 }, // orange
    { h: 60,  s: 0.50, v: 0.68 }, // yellow
    { h: 120, s: 0.45, v: 0.65 }, // green
    { h: 180, s: 0.45, v: 0.65 }, // cyan/teal
    { h: 210, s: 0.50, v: 0.62 }, // blue
    { h: 240, s: 0.58, v: 0.68 }, // indigo
    { h: 270, s: 0.60, v: 0.70 }, // violet
    { h: 300, s: 0.55, v: 0.70 }, // purple
    { h: 330, s: 0.58, v: 0.70 }, // magenta
  ];

  const state = {
    basePalette: [...DEFAULT_BASE_PALETTE], 
    planets: [],
    scenes: [],
    aggregates: makeEmptyAggregates(),
    lastPosterDataURL: null,
    // Gallery pagination
    gallery: {
      allItems: [],        // Filtered & sorted items
      loadedCount: 0,      // Number of items currently rendered
      itemsPerPage: 50,    // Load 50 items at a time
      isLoading: false     // Prevent multiple simultaneous loads
    }
  };  
  

  // ---------- INIT ----------
  console.log('Script loaded, readyState:', document.readyState);
  console.log('D3 available:', typeof d3 !== 'undefined');
  
  // Wait for DOM and D3.js to be ready
  if (document.readyState === 'loading') {
    console.log('Waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    console.log('DOM already loaded');
    // If D3.js is loaded via script tag, wait a bit
    if (typeof d3 !== 'undefined') {
      console.log('D3 already loaded, initializing');
      initialize();
    } else {
      console.log('Waiting for D3 to load');
      // Wait for D3.js to load
      const checkD3 = setInterval(() => {
        if (typeof d3 !== 'undefined') {
          console.log('D3 loaded, initializing');
          clearInterval(checkD3);
          initialize();
        }
      }, 50);
      // Timeout after 2 seconds
      setTimeout(() => {
        clearInterval(checkD3);
        if (typeof d3 === 'undefined') {
          console.error('D3.js failed to load after 2 seconds');
        } else {
          console.log('D3 loaded (timeout), initializing');
          initialize();
        }
      }, 2000);
    }
  }

  function initialize() {
    console.log('initialize() called');
    
    // Initialize all DOM references
    posterInput = document.getElementById("posterInput");
    posterFileName = document.getElementById("posterFileName");
    analyzePosterBtn = document.getElementById("analyzePosterBtn");
    posterStatus = document.getElementById("posterStatus");
    posterPreviewImg = document.getElementById("posterPreviewImg");
    posterPreviewFrame = document.getElementById("posterPreviewFrame");
    posterPaletteRow = document.getElementById("posterPaletteRow");

    orbitWrap = document.getElementById("orbitWrap");
    orbitSvg = document.getElementById("orbitSvg");

    sceneForm = document.getElementById("sceneForm");
    movieTitleInput = document.getElementById("movieTitle");
    positivitySelect = document.getElementById("positivitySelect");
    sceneInput = document.getElementById("sceneInput");
    sceneFileName = document.getElementById("sceneFileName");
    sceneStatus = document.getElementById("sceneStatus");

    scenePreviewImg = document.getElementById("scenePreviewImg");
    scenePreviewFrame = document.getElementById("scenePreviewFrame");
    sceneSelectedBadge = document.getElementById("sceneSelectedBadge");

    svTableBody = document.getElementById("svTableBody");
    countChart = document.getElementById("countChart");
    svChart = document.getElementById("svChart");

    galleryGrid = document.getElementById("galleryGrid");
    galleryEmpty = document.getElementById("galleryEmpty");
    gallerySearch = document.getElementById("gallerySearch");
    gallerySort = document.getElementById("gallerySort");
    galleryFilterChip = document.getElementById("galleryFilterChip");
    galleryLoading = document.getElementById("galleryLoading");
    exportJsonBtn = document.getElementById("exportJsonBtn");
    resetAllBtn = document.getElementById("resetAllBtn");

    backToTopBtn = document.getElementById("backToTopBtn");

    workCanvas = document.getElementById("workCanvas");
    if (!workCanvas) {
      console.error('workCanvas not found!');
      return;
    }
    wctx = workCanvas.getContext("2d", { willReadFrequently: true });
    
    console.log('DOM elements initialized');
    
    loadFromStorage();
    initUI();
    
    console.log('About to initialize planets...');
    // Initialize planets first, then load data
    setTimeout(() => {
      console.log('Timeout fired, calling initPlanets()');
      initPlanets();
      
      // Load data from Django backend after planets are initialized
      loadFromBackend().then(() => {
        console.log('Backend data loaded');
        rebuildAll();
        // Update planet colors based on loaded data
        applyPaletteToPlanets();
      });
    }, 100);
  }

  // =========================================================
  // UI INIT
  // =========================================================
  function parseFilenameMeta(filename) {
    // 1. 확장자 제거 (예: "Movie_5.jpg" -> "Movie_5")
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  
    // 2. 파일명 끝에서 마지막 한 자리 숫자(1-9) 찾기
    const lastDigitMatch = nameWithoutExt.match(/(\d)(?!.*\d)/);
    
    if (!lastDigitMatch) {
      console.warn(`No digit found in filename: ${filename}`);
      return null;
    }
    
    const level = Number(lastDigitMatch[1]);
    
    // 3. 레벨이 1-9 범위인지 확인
    if (level < 1 || level > 9) {
      console.warn(`Invalid level ${level} in filename: ${filename}`);
      return null;
    }
    
    // 4. 영화 제목 추출: 마지막 숫자와 그 주변 구분자(_-공백) 제거
    // 예: "Interstellar_7" -> "Interstellar"
    // 예: "Inception 8" -> "Inception"
    // 예: "The Matrix-5" -> "The Matrix"
    let title = nameWithoutExt.replace(/[_\s-]*\d[_\s-]*$/, '').trim();
    
    // 5. 앞쪽의 인덱스 번호 제거 (예: "123 - Movie Title" -> "Movie Title")
    title = title.replace(/^\d+\s*[-_]\s*/, '');
    
    // 6. 언더스코어/하이픈을 공백으로 변환하고 중복 공백 제거
    title = title.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    
    // 7. 제목이 비어있으면 실패
    if (!title) {
      console.warn(`Empty title after parsing: ${filename}`);
      return null;
    }
    
    console.log(`Parsed: "${filename}" -> Title: "${title}", Level: ${level}`);
    
    return {
      title,
      level
    };
  }
  
  
  function initUI() {
    posterInput.addEventListener("change", () => {
      const f = posterInput.files?.[0];
      posterFileName.textContent = f ? f.name : "No file selected";
      posterStatus.textContent = "Status: Poster file selected (Analyze button to apply)";
      setPosterPreview(f, posterPreviewImg, posterPreviewFrame);
    });

    analyzePosterBtn.addEventListener("click", async () => {
      const f = posterInput.files?.[0];
      if (!f) {
        posterStatus.textContent = "Status: Please select a poster file first.";
        return;
      }
      posterStatus.textContent = "Status: Uploading… (Sending to backend server)";
      analyzePosterBtn.disabled = true;

      try {
        // Upload to Django backend
        const formData = new FormData();
        formData.append('file', f);
        
        const response = await fetch('/api/poster/upload/', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          throw new Error('Backend upload failed');
        }
        
        const data = await response.json();
        
        if (data.success && data.palette && data.palette.length > 0) {
          state.basePalette = data.palette;
          renderPaletteSwatches(state.basePalette);
          applyPaletteToPlanets();
          posterStatus.textContent = "Status: Completed — Applied to planet color spectrum";
          saveToStorage();
          console.log('✓ Poster uploaded, ID:', data.poster_id);
        } else {
          throw new Error('Palette extraction failed');
        }
      } catch (e) {
        console.error('Poster upload failed:', e);
        posterStatus.textContent = `Status: Failed — ${e.message}`;
      } finally {
        analyzePosterBtn.disabled = false;
      }
    });

    sceneInput.addEventListener("change", async () => {
      const files = sceneInput.files;
      const fileCount = files?.length || 0;
      
      if (fileCount === 0) {
        sceneFileName.textContent = "No file selected";
        sceneSelectedBadge.classList.remove("scenePreview__badge--on");
        sceneStatus.textContent = "Status: Waiting";
        hidePreview(scenePreviewImg, scenePreviewFrame);
        return;
      }

      // Display file count
      sceneFileName.textContent = fileCount === 1 ? files[0].name : `${fileCount} files selected`;
      sceneSelectedBadge.classList.add("scenePreview__badge--on");

      // If single file, auto-fill from filename
      if (fileCount === 1) {
        const f = files[0];
        const meta = parseFilenameMeta(f.name);
        if (meta) {
          movieTitleInput.value = meta.title;
          positivitySelect.value = String(meta.level);
          sceneStatus.textContent = `Status: Automatically inputted from filename "${meta.title}" / Level ${meta.level}`;
        } else {
          sceneStatus.textContent = "Status: Scene file selected (Uploaded data will be accumulated)";
        }
        setPosterPreview(f, scenePreviewImg, scenePreviewFrame);
      } else {
        // Multiple files
        sceneStatus.textContent = `Status: ${fileCount} files selected. Automatically extracted from filename.`;
        // Show first file preview
        setPosterPreview(files[0], scenePreviewImg, scenePreviewFrame);
      }
    });

    sceneForm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const title = (movieTitleInput.value || "").trim();
      const levelStr = positivitySelect.value;
      const file = sceneInput.files?.[0];

      if (!title) {
        sceneStatus.textContent = "Status: Please enter the movie title.";
        return;
      }
      if (!levelStr) {
        sceneStatus.textContent = "Status: Please select the positivity level (1~9).";
        return;
      }
      if (!file) {
        sceneStatus.textContent = "Status: Please select the scene image.";
        return;
      }

      const level = Number(levelStr);

      sceneStatus.textContent = "Status: Uploading… (Sending to backend server)";
      try {
        console.log('Starting single file upload:', file.name);
        
        // Upload to Django backend
        const formData = new FormData();
        formData.append('file', file);
        formData.append('movie_title', title);
        formData.append('positivity_level', level);
        
        const response = await fetch('/api/scene/upload/', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          throw new Error('Backend upload failed');
        }
        
        const data = await response.json();
        
        if (data.success) {
          console.log('✓ Scene uploaded, ID:', data.scene_id);
          
          // Reload data from backend
          await loadFromBackend();
          rebuildAll();
          
          // Update planet colors based on new data
          applyPaletteToPlanets();
          
          sceneStatus.textContent = "Status: Completed — Accumulated data & reflected in gallery";
          
          // Reset form
          sceneInput.value = "";
          sceneFileName.textContent = "No file selected";
          sceneSelectedBadge.classList.remove("scenePreview__badge--on");
        } else {
          throw new Error(data.error || 'Upload failed');
        }
      } catch (e) {
        console.error('Single file upload failed:', e);
        sceneStatus.textContent = `Status: Failed — ${e.message}`;
      }
    });

    async function uploadMultipleScenes(files) {
      const totalFiles = files.length;
      let successCount = 0;
      let errorCount = 0;

      sceneStatus.textContent = `Status: ${totalFiles} files uploading... (0/${totalFiles})`;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        try {
          const meta = parseFilenameMeta(file.name);
          
          if (!meta) {
            console.warn(`Skipping ${file.name}: cannot parse filename`);
            errorCount++;
            continue;
          }

          const { title, level } = meta;

          // Upload to Django backend
          const formData = new FormData();
          formData.append('file', file);
          formData.append('movie_title', title);
          formData.append('positivity_level', level);
          
          const response = await fetch('/api/scene/upload/', {
            method: 'POST',
            body: formData
          });
          
          if (!response.ok) {
            throw new Error('Backend upload failed');
          }
          
          const data = await response.json();
          
          if (data.success) {
            successCount++;
            console.log(`✓ Uploaded ${file.name} (${title}, Level ${level})`);
          } else {
            throw new Error(data.error || 'Upload failed');
          }

          sceneStatus.textContent = `Status: Uploading... (${i + 1}/${totalFiles}) - ${file.name}`;

        } catch (err) {
          console.error(`Error uploading ${file.name}:`, err);
          errorCount++;
        }
      }

      // Reload data from backend
      await loadFromBackend();
      rebuildAll();
      
      // Update planet colors based on new data
      applyPaletteToPlanets();

      sceneStatus.textContent = `Status: Completed — ${successCount} success, ${errorCount} failure (Total ${totalFiles} files)`;

      sceneInput.value = "";
      sceneFileName.textContent = "No file selected";
      sceneSelectedBadge.classList.remove("scenePreview__badge--on");
    }

    if (gallerySearch) {
      gallerySearch.addEventListener("input", () => {
        renderGallery();
      });
    }
    
    if (gallerySort) {
      gallerySort.addEventListener("change", () => {
        renderGallery();
      });
    }

    // Infinite scroll for gallery
    window.addEventListener("scroll", () => {
      if (!galleryGrid || state.gallery.isLoading) return;
      
      const gallerySection = document.getElementById("gallery");
      if (!gallerySection) return;
      
      const sectionRect = gallerySection.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      // Trigger load when scrolled near bottom of gallery section (within 500px)
      if (sectionRect.bottom < windowHeight + 500) {
        loadMoreGalleryItems();
      }
    });

    if (exportJsonBtn) {
      exportJsonBtn.addEventListener("click", () => {
        const payload = {
          basePalette: state.basePalette,
          scenes: state.scenes.map(s => ({
            id: s.id,
            title: s.title,
            level: s.level,
            createdAt: s.createdAt,
            hsv: s.hsv
            // thumb 제외(용량 큼) — 필요하면 백엔드에서 저장하도록 설계 가능
          })),
          aggregates: state.aggregates
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cinematic_emotion_lab_export.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    }

    if (resetAllBtn) {
      resetAllBtn.addEventListener("click", () => {
        if (!confirm("Are you sure you want to reset all uploads/accumulated data?")) return;
        state.scenes = [];
        state.aggregates = makeEmptyAggregates();
        if (gallerySearch) gallerySearch.value = "";
        if (gallerySort) gallerySort.value = "newest";
        rebuildAll();
        saveToStorage();
        if (sceneStatus) sceneStatus.textContent = "Status: All reset completed";
      });
    }

    if (backToTopBtn) {
      backToTopBtn.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    // Statistical Analysis
    const analyzeCorrelationBtn = document.getElementById('analyzeCorrelationBtn');
    if (analyzeCorrelationBtn) {
      analyzeCorrelationBtn.addEventListener('click', analyzeCorrelation);
    }

    // Export buttons
    const exportScenesCSV = document.getElementById('exportScenesCSV');
    const exportAggregatesCSV = document.getElementById('exportAggregatesCSV');
    const exportJSON = document.getElementById('exportJSON');

    if (exportScenesCSV) {
      exportScenesCSV.addEventListener('click', () => {
        window.location.href = '/api/export/scenes-csv/';
      });
    }

    if (exportAggregatesCSV) {
      exportAggregatesCSV.addEventListener('click', () => {
        window.location.href = '/api/export/aggregates-csv/';
      });
    }

    if (exportJSON) {
      exportJSON.addEventListener('click', downloadJSON);
    }

    // restore last poster preview if stored
    if (state.lastPosterDataURL) {
      (async () => {
        try {
          const img = await dataURLToImage(state.lastPosterDataURL);
          posterPreviewImg.src = state.lastPosterDataURL;
          posterPreviewImg.style.display = "block";
          posterPreviewFrame.querySelector(".posterPreview__placeholder").style.display = "none";
          renderPaletteSwatches(state.basePalette);
        } catch { /* ignore */ }
      })();
    } else {
      renderPaletteSwatches(state.basePalette);
    }
  }

  // =========================================================
  // PLANETS (Three.js 3D)
  // =========================================================
  let scene, camera, renderer, planetCanvas;
  let planetMeshes = [];
  let orbitLines = [];
  let planetAnimationId = null;
  let starFields = [];  // Store star fields for animation

  function initPlanets() {
    console.log('initPlanets() called');
    
    // Check if Three.js is loaded
    if (typeof THREE === 'undefined') {
      console.error('Three.js is not loaded!');
      return;
    }
    console.log('Three.js is loaded');

    // Check if required DOM elements exist
    if (!orbitWrap) {
      console.error('orbitWrap not found!');
      return;
    }

    planetCanvas = document.getElementById("planetCanvas");
    if (!planetCanvas) {
      console.error('planetCanvas not found!');
      return;
    }

    // Setup Three.js scene
    scene = new THREE.Scene();
    
    // Create space background with gradient
    createSpaceBackground();

    // Camera setup
    const aspect = orbitWrap.clientWidth / orbitWrap.clientHeight;
    camera = new THREE.PerspectiveCamera(33, aspect, 0.1, 3000);
    // Position camera to view 3x3 grid
    // Positioned in front, slightly above and to the right for better angle
    camera.position.set(100, 250, 850);
    camera.lookAt(0, 0, 0);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ 
      canvas: planetCanvas, 
      antialias: true,
      alpha: false 
    });
    renderer.setSize(orbitWrap.clientWidth, orbitWrap.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Enhanced Lighting for high-quality planets
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Main directional light (sun-like)
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.5);
    mainLight.position.set(300, 300, 300);
    mainLight.castShadow = true;
    scene.add(mainLight);

    // Rim light for planet edges
    const rimLight = new THREE.PointLight(0x6b8cff, 0.2);
    rimLight.position.set(-200, 100, -200);
    scene.add(rimLight);

    // Bottom fill light
    const fillLight = new THREE.PointLight(0xff9966, 0.4);
    fillLight.position.set(0, -200, 200);
    scene.add(fillLight);

    // Accent light for highlights
    const accentLight = new THREE.SpotLight(0xffffff, 0.6);
    accentLight.position.set(0, 400, 0);
    accentLight.angle = Math.PI / 4;
    scene.add(accentLight);

    // Clear old
    state.planets = [];
    planetMeshes = [];
    orbitLines = [];

    const orbitCount = 9;
    const spacing = 180; // Space between planets (increased for better spacing)
    const columns = 3; // 3 columns per row

    // Build planets in 3x3 grid layout
    // Row 1: 1, 2, 3
    // Row 2: 4, 5, 6
    // Row 3: 7, 8, 9
    for (let i = 1; i <= orbitCount; i++) {
      // Calculate grid position (3 columns x 3 rows)
      const gridCol = (i - 1) % columns; // 0, 1, 2
      const gridRow = Math.floor((i - 1) / columns); // 0, 1, 2
      
      // Position in 3D space (centered grid)
      const xPosition = (gridCol - 1) * spacing; // -spacing, 0, +spacing
      const yPosition = (1 - gridRow) * spacing; // +spacing, 0, -spacing (top to bottom)
      const zPosition = 0; // All at same depth
      
      const rotationSpeed = 0.0002 + i * 0.00004; // Rotation speed (self-rotation only, slower)
      const size = 35 + i * 2.0; // Planet size increases with level
      const col = getLevelColor(i);

      // Subtle floating animation parameters (gentle bobbing)
      const floatAmplitude = 8 + (i % 3) * 3;
      const floatSpeed = 0.0002 + (i % 4) * 0.0001; 
      const floatPhase = i * 0.7; 

      state.planets.push({
        level: i,
        xPosition,
        yPosition,
        zPosition,
        rotationSpeed,
        size,
        color: hsvToCss(col),
        hsv: col,
        floatAmplitude,
        floatSpeed,
        floatPhase,
        // Physics properties for collision
        velocityX: 0,
        velocityY: 0,
        velocityZ: 0,
        mass: size
      });

      // Create planet with striped texture
      const planetMesh = createPlanetMesh(size, col, i);
      planetMesh.userData.level = i;
      planetMesh.userData.xPosition = xPosition;
      planetMesh.userData.yPosition = yPosition;
      planetMesh.userData.zPosition = zPosition;
      planetMesh.userData.rotationSpeed = rotationSpeed;
      planetMesh.userData.floatAmplitude = floatAmplitude;
      planetMesh.userData.floatSpeed = floatSpeed;
      planetMesh.userData.floatPhase = floatPhase;
      // Physics properties
      planetMesh.userData.velocityX = 0;
      planetMesh.userData.velocityY = 0;
      planetMesh.userData.velocityZ = 0;
      planetMesh.userData.mass = size;
      planetMesh.userData.radius = size;
      
      // Set initial position in line
      planetMesh.position.set(xPosition, yPosition, zPosition);
      
      scene.add(planetMesh);
      planetMeshes.push(planetMesh);
    }

    console.log(`Created ${planetMeshes.length} planets in 3x3 grid layout`);

    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    setupPlanetInteraction();
    
    applyPaletteToPlanets();
    startOrbitAnimation();
  }

  function setupPlanetInteraction() {
    // Planet interaction disabled (no filtering)
  }

  function createSpaceBackground() {
    // 1. Background gradient (deep space)
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    
    // Create radial gradient for space depth
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, canvas.width / 2
    );
    gradient.addColorStop(0, '#0a0e27');    // Dark blue center
    gradient.addColorStop(0.5, '#050a1e');  // Darker middle
    gradient.addColorStop(1, '#000000');    // Black edges
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add nebula effect (purple/blue clouds)
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = Math.random() * 400 + 200;
      
      const nebulaGradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      const hue = Math.random() * 60 + 240; // Blue to purple range
      nebulaGradient.addColorStop(0, `hsla(${hue}, 70%, 30%, 0.15)`);
      nebulaGradient.addColorStop(0.5, `hsla(${hue}, 60%, 20%, 0.08)`);
      nebulaGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.fillStyle = nebulaGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    scene.background = texture;
    
    // 2. Create stars (particle system)
    createStarField();
    
    // 3. Add distant stars layer
    createDistantStars();
  }

  function createStarField() {
    // Clear old star fields
    starFields = [];
    
    // Create multiple layers of stars for depth
    const starGroups = [
      { count: 3000, size: 2, distance: 2000, color: 0xffffff, brightness: 1.0, rotSpeed: 0.00005 },
      { count: 2000, size: 1.5, distance: 1500, color: 0xaaccff, brightness: 0.8, rotSpeed: 0.00008 },
      { count: 1000, size: 1, distance: 1000, color: 0xffddaa, brightness: 0.6, rotSpeed: 0.0001 }
    ];
    
    starGroups.forEach(group => {
      const starsGeometry = new THREE.BufferGeometry();
      const starPositions = [];
      const starColors = [];
      const starSizes = [];
      
      for (let i = 0; i < group.count; i++) {
        // Random position in sphere
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const radius = group.distance;
        
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);
        
        starPositions.push(x, y, z);
        
        // Random color variation
        const colorVariation = Math.random() * 0.3 + 0.85;
        const color = new THREE.Color(group.color);
        color.multiplyScalar(colorVariation);
        starColors.push(color.r, color.g, color.b);
        
        // Random size variation
        starSizes.push(group.size * (Math.random() * 0.5 + 0.75));
      }
      
      starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
      starsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
      starsGeometry.setAttribute('size', new THREE.Float32BufferAttribute(starSizes, 1));
      
      const starsMaterial = new THREE.PointsMaterial({
        size: group.size,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: group.brightness,
        blending: THREE.AdditiveBlending
      });
      
      const starField = new THREE.Points(starsGeometry, starsMaterial);
      starField.userData.rotSpeed = group.rotSpeed;
      scene.add(starField);
      starFields.push(starField);
    });
  }

  function createDistantStars() {
    // Add tiny distant stars for more depth
    const distantGeometry = new THREE.BufferGeometry();
    const distantPositions = [];
    const distantSizes = [];
    
    for (let i = 0; i < 5000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const radius = 2500;
      
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);
      
      distantPositions.push(x, y, z);
      distantSizes.push(0.5 + Math.random() * 0.5);
    }
    
    distantGeometry.setAttribute('position', new THREE.Float32BufferAttribute(distantPositions, 3));
    distantGeometry.setAttribute('size', new THREE.Float32BufferAttribute(distantSizes, 1));
    
    const distantMaterial = new THREE.PointsMaterial({
      size: 0.8,
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending
    });
    
    const distantStars = new THREE.Points(distantGeometry, distantMaterial);
    scene.add(distantStars);
  }

  function createPlanetMesh(radius, baseColor, level) {
    // Balanced sphere geometry (good quality + performance)
    const geometry = new THREE.SphereGeometry(radius, 64, 64);
    
    // Create optimized striped texture from palette
    const texture = createStripedTexture(level);
    
    // Create bump map for surface detail
    const bumpMap = createBumpMap(level);
    
    // Material properties based on REAL DATA (baseColor.s and baseColor.v)
    // Higher saturation = smoother, more metallic
    // Higher value = more emissive, more reflective
    
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      bumpMap: bumpMap,
      bumpScale: 0.8,
      roughness: 0.85 - (baseColor.s * 0.5), // High saturation = smoother (0.85 → 0.35)
      metalness: 0.10 + (baseColor.s * 0.25), // High saturation = more metallic (0.10 → 0.35)
      emissive: new THREE.Color().setHSL(
        baseColor.h / 360, 
        baseColor.s * 0.6, // Reduced from 0.7
        baseColor.v * (0.02 + baseColor.v * 0.10) // Reduced glow (was 0.05 + v*0.20)
      ),
      emissiveIntensity: 0.08 + (baseColor.v * 0.25), // DIMMED: 0.08 → 0.33 (was 0.15 → 0.65)
      envMapIntensity: 0.15 + (baseColor.s * 0.25) + (baseColor.v * 0.20) // DIMMED reflectivity
    });

    const mesh = new THREE.Mesh(geometry, material);
    
    // DIMMED: Atmosphere intensity based on REAL brightness (reduced)
    const atmosphereIntensity = 0.4 + (baseColor.v * 0.5); // DIMMED (was 0.6 + v*0.8)
    
    // Layer 1: Inner glow (DIMMED)
    const atmo1Geometry = new THREE.SphereGeometry(radius * 1.08, 32, 32);
    const atmo1Material = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(
        baseColor.h / 360, 
        baseColor.s * 0.8, // Reduced from 0.9
        Math.min(1.0, baseColor.v * 0.8 * atmosphereIntensity) // Reduced from v*1.1
      ),
      transparent: true,
      opacity: 0.08 + (baseColor.v * 0.20), // DIMMED: 0.08 → 0.28 (was 0.15 → 0.50)
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const atmo1Mesh = new THREE.Mesh(atmo1Geometry, atmo1Material);
    mesh.add(atmo1Mesh);
    
    // Layer 2: Outer atmosphere (DIMMED)
    const atmo2Geometry = new THREE.SphereGeometry(radius * 1.20, 32, 32);
    const atmo2Material = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(
        baseColor.h / 360, 
        baseColor.s * 0.6, // Reduced from 0.7
        Math.min(1.0, baseColor.v * 0.6 * atmosphereIntensity) // Reduced from v*0.8
      ),
      transparent: true,
      opacity: 0.05 + (baseColor.v * 0.15), // DIMMED: 0.05 → 0.20 (was 0.08 → 0.33)
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const atmo2Mesh = new THREE.Mesh(atmo2Geometry, atmo2Material);
    mesh.add(atmo2Mesh);
    
    // Layer 3: Distant halo
    const haloGeometry = new THREE.SphereGeometry(radius * 1.35, 24, 24);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(baseColor.h / 360, baseColor.s * 0.5, baseColor.v * 0.6),
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const haloMesh = new THREE.Mesh(haloGeometry, haloMaterial);
    mesh.add(haloMesh);
    
    // Add label sprite
    const labelSprite = createLabelSprite(level, radius);
    labelSprite.position.set(0, radius + 12, 0);
    mesh.add(labelSprite);
    
    return mesh;
  }

  // Advanced Perlin-like noise function for natural textures
  function noise2D(x, y, seed = 0) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
    return n - Math.floor(n);
  }

  function smoothNoise(x, y, seed) {
    const corners = (noise2D(x-1, y-1, seed) + noise2D(x+1, y-1, seed) + 
                    noise2D(x-1, y+1, seed) + noise2D(x+1, y+1, seed)) / 16;
    const sides = (noise2D(x-1, y, seed) + noise2D(x+1, y, seed) + 
                  noise2D(x, y-1, seed) + noise2D(x, y+1, seed)) / 8;
    const center = noise2D(x, y, seed) / 4;
    return corners + sides + center;
  }

  function turbulence(x, y, size, seed) {
    let value = 0;
    let initialSize = size;
    while(size >= 1) {
      value += smoothNoise(x / size, y / size, seed) * size;
      size /= 2.0;
    }
    return value / initialSize;
  }

  function createStripedTexture(level) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;  // Optimized resolution for performance
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Get palette colors
    const palette = state.basePalette;
    const stripeCount = 12; // Optimized stripe count
    const stripeHeight = canvas.height / stripeCount;

    // Get level color to determine SV adjustment based on REAL DATA
    const levelColor = getLevelColor(level);
    
    // Use actual analyzed SV to influence texture
    // Subtract base palette average to get the deviation
    const paletteAvgS = palette.reduce((sum, c) => sum + c.s, 0) / palette.length;
    const paletteAvgV = palette.reduce((sum, c) => sum + c.v, 0) / palette.length;
    
    // Calculate boost based on real data deviation
    const levelSatBoost = (levelColor.s - paletteAvgS) * 0.8; // 80% of deviation
    const levelValBoost = (levelColor.v - paletteAvgV) * 0.8; // 80% of deviation

    // Create base layer with advanced gradients
    for (let i = 0; i < stripeCount; i++) {
      const paletteIndex = i % palette.length;
      const col = palette[paletteIndex];
      
      // Complex variation using multiple sine waves
      const variation1 = Math.sin(i * 0.7) * 0.12;
      const variation2 = Math.cos(i * 1.3 + level) * 0.08;
      const h = col.h;
      
      // Apply level-based adjustments with DIMMED brightness
      const s = Math.max(0.1, Math.min(1, col.s + variation1 + variation2 + levelSatBoost));
      const v = Math.max(0.10, Math.min(0.70, (col.v + variation1 * 0.5 + levelValBoost) * 0.7)); // DIMMED: max 0.70, ×0.7
      
      // Create complex multi-stop gradient for each stripe
      const gradient = ctx.createLinearGradient(0, i * stripeHeight, canvas.width, i * stripeHeight);
      
      // Main color with horizontal variation (DIMMED)
      for (let stop = 0; stop <= 10; stop++) {
        const stopPos = stop / 10;
        const turbVal = turbulence(stopPos * 10, i, 32, level) * 0.12; // Reduced from 0.15
        const adjustedV = Math.max(0.12, Math.min(0.65, v + turbVal * 0.6)); // DIMMED: max 0.65
        const adjustedS = Math.max(0.2, Math.min(1, s + turbVal * 0.4)); // Slightly reduced
        gradient.addColorStop(stopPos, hsvToCss({ h, s: adjustedS, v: adjustedV }));
      }
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, i * stripeHeight, canvas.width, stripeHeight);
      
      // Add sophisticated inner gradient for depth
      const depthGradient = ctx.createLinearGradient(0, i * stripeHeight, 0, (i + 1) * stripeHeight);
      depthGradient.addColorStop(0, `rgba(255,255,255,${0.2})`);
      depthGradient.addColorStop(0.15, 'rgba(255,255,255,0.05)');
      depthGradient.addColorStop(0.5, 'rgba(0,0,0,0)');
      depthGradient.addColorStop(0.85, 'rgba(0,0,0,0.05)');
      depthGradient.addColorStop(1, `rgba(0,0,0,${0.25})`);
      ctx.fillStyle = depthGradient;
      ctx.fillRect(0, i * stripeHeight, canvas.width, stripeHeight);
    }

    // Add procedural noise layer (optimized)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 4) {
      for (let x = 0; x < canvas.width; x += 4) {
        const idx = (y * canvas.width + x) * 4;
        const noiseVal = turbulence(x / 80, y / 80, 64, level + 100) * 25;
        imageData.data[idx] += noiseVal;
        imageData.data[idx + 1] += noiseVal;
        imageData.data[idx + 2] += noiseVal;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // Add atmospheric scattering effect (lighter at edges)
    const atmosphereGradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.width * 0.3,
      canvas.width / 2, canvas.height / 2, canvas.width * 0.6
    );
    atmosphereGradient.addColorStop(0, 'rgba(255,255,255,0)');
    atmosphereGradient.addColorStop(0.7, 'rgba(255,255,255,0.02)');
    atmosphereGradient.addColorStop(1, 'rgba(200,220,255,0.08)');
    ctx.fillStyle = atmosphereGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add surface features (craters, storms, clouds)
    for (let n = 0; n < 30; n++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = Math.random() * 80 + 20;
      const opacity = Math.random() * 0.15 + 0.05;
      
      const featureGradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      featureGradient.addColorStop(0, `rgba(255,255,255,${opacity})`);
      featureGradient.addColorStop(0.4, `rgba(200,200,255,${opacity * 0.5})`);
      featureGradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = featureGradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Add swirl patterns for gas giant effect
    ctx.globalAlpha = 0.1;
    for (let s = 0; s < 8; s++) {
      const startY = Math.random() * canvas.height;
      const amplitude = Math.random() * 100 + 50;
      const frequency = Math.random() * 0.01 + 0.005;
      
      ctx.beginPath();
      ctx.moveTo(0, startY);
      for (let x = 0; x < canvas.width; x += 10) {
        const y = startY + Math.sin(x * frequency + level) * amplitude;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
      ctx.lineWidth = Math.random() * 3 + 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 16; // Maximum anisotropic filtering
    return texture;
  }

  function createBumpMap(level) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;  // Optimized resolution
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Create optimized noise for terrain
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    
    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        const idx = (y * canvas.width + x) * 4;
        
        // Simplified noise calculation
        const noise1 = turbulence(x / 30, y / 30, 32, level) * 0.6;
        const noise2 = smoothNoise(x / 100, y / 100, level) * 0.4;
        
        const combined = (noise1 + noise2) * 255;
        const value = Math.max(0, Math.min(255, combined));
        
        imageData.data[idx] = value;
        imageData.data[idx + 1] = value;
        imageData.data[idx + 2] = value;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    
    // Add mountain ranges (elongated high-contrast features)
    for (let i = 0; i < 10; i++) {
      const startX = Math.random() * canvas.width;
      const startY = Math.random() * canvas.height;
      const length = Math.random() * 400 + 200;
      const angle = Math.random() * Math.PI * 2;
      
      for (let t = 0; t < length; t += 5) {
        const x = startX + Math.cos(angle) * t + (Math.random() - 0.5) * 50;
        const y = startY + Math.sin(angle) * t + (Math.random() - 0.5) * 50;
        const radius = Math.random() * 30 + 15;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, 'rgba(255,255,255,0.6)');
        gradient.addColorStop(0.5, 'rgba(255,255,255,0.3)');
        gradient.addColorStop(1, 'rgba(128,128,128,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Add impact craters with realistic depth
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = Math.random() * 60 + 20;
      
      // Crater rim (bright)
      const rimGradient = ctx.createRadialGradient(x, y, radius * 0.7, x, y, radius);
      rimGradient.addColorStop(0, 'rgba(255,255,255,0)');
      rimGradient.addColorStop(0.7, 'rgba(255,255,255,0.5)');
      rimGradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rimGradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Crater center (dark)
      const centerGradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.6);
      centerGradient.addColorStop(0, 'rgba(0,0,0,0.6)');
      centerGradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = centerGradient;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Add fine detail texture overlay (optimized)
    ctx.globalAlpha = 0.2;
    for (let y = 0; y < canvas.height; y += 8) {
      for (let x = 0; x < canvas.width; x += 8) {
        if (Math.random() > 0.7) {
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }
    ctx.globalAlpha = 1.0;
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  function createLabelSprite(level, radius) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Add subtle background glow
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    // Draw text with outline
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Outline
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 4;
    ctx.strokeText(level.toString(), 64, 64);
    
    // Fill
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillText(level.toString(), 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true,
      opacity: 0.9
    });
    const sprite = new THREE.Sprite(material);
    const scale = radius * 0.5;
    sprite.scale.set(scale, scale, 1);
    return sprite;
  }

  function onWindowResize() {
    if (!camera || !renderer || !orbitWrap) return;
    
    const width = orbitWrap.clientWidth;
    const height = orbitWrap.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function createPlanetFilters() {
    // Shadow filter for depth
    const shadowFilter = d3Defs.append("filter")
      .attr("id", "planetShadow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");

    shadowFilter.append("feGaussianBlur")
      .attr("in", "SourceAlpha")
      .attr("stdDeviation", 4)
      .attr("result", "blur");

    shadowFilter.append("feOffset")
      .attr("in", "blur")
      .attr("dx", 2)
      .attr("dy", 2)
      .attr("result", "offsetBlur");

    const feMerge = shadowFilter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "offsetBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Glow filter for active planets
    const glowFilter = d3Defs.append("filter")
      .attr("id", "planetGlow")
      .attr("x", "-100%")
      .attr("y", "-100%")
      .attr("width", "300%")
      .attr("height", "300%");

    glowFilter.append("feGaussianBlur")
      .attr("stdDeviation", 8)
      .attr("result", "coloredBlur");

    const feMergeGlow = glowFilter.append("feMerge");
    feMergeGlow.append("feMergeNode").attr("in", "coloredBlur");
    feMergeGlow.append("feMergeNode").attr("in", "SourceGraphic");
  }

  function createPlanetGradients() {
    state.planets.forEach((pl, idx) => {
      const col = pl.hsv;
      const baseColor = hsvToCss(col);
      const lightColor = hsvToCss({ h: col.h, s: col.s, v: clamp01(col.v + 0.15) });
      const darkColor = hsvToCss({ h: col.h, s: clamp01(col.s + 0.1), v: clamp01(col.v - 0.2) });
      const highlightColor = hsvToCss({ h: col.h, s: clamp01(col.s - 0.1), v: clamp01(col.v + 0.25) });

      // Main planet gradient (3D sphere effect)
      const mainGrad = d3Defs.append("radialGradient")
        .attr("id", `planetGrad${pl.level}`)
        .attr("cx", "35%")
        .attr("cy", "30%")
        .attr("r", "70%");

      mainGrad.append("stop")
        .attr("offset", "0%")
        .attr("stop-color", highlightColor)
        .attr("stop-opacity", 0.95);

      mainGrad.append("stop")
        .attr("offset", "40%")
        .attr("stop-color", lightColor)
        .attr("stop-opacity", 1);

      mainGrad.append("stop")
        .attr("offset", "70%")
        .attr("stop-color", baseColor)
        .attr("stop-opacity", 1);

      mainGrad.append("stop")
        .attr("offset", "100%")
        .attr("stop-color", darkColor)
        .attr("stop-opacity", 0.9);

      // Atmosphere/glow gradient
      const glowGrad = d3Defs.append("radialGradient")
        .attr("id", `planetGlow${pl.level}`)
        .attr("cx", "50%")
        .attr("cy", "50%")
        .attr("r", "50%");

      glowGrad.append("stop")
        .attr("offset", "0%")
        .attr("stop-color", baseColor)
        .attr("stop-opacity", 0.4);

      glowGrad.append("stop")
        .attr("offset", "100%")
        .attr("stop-color", baseColor)
        .attr("stop-opacity", 0);
    });
  }

  function createPlanetElements() {
    const centerX = 500;
    const centerY = 350;

    state.planets.forEach((pl) => {
      // Calculate initial position
      const x = centerX + Math.cos(pl.phase) * pl.radiusNorm;
      const y = centerY + Math.sin(pl.phase) * pl.radiusNorm;

      const planetGroup = d3PlanetsGroup.append("g")
        .attr("class", "planetGroup")
        .attr("data-level", pl.level)
        .attr("transform", `translate(${x}, ${y})`)
        .style("cursor", "pointer")
        .on("click", () => setFilter(pl.level))
        .on("mouseenter", function() {
          d3.select(this).select(".planetGlow")
            .transition()
            .duration(200)
            .attr("r", pl.size * 0.7)
            .attr("opacity", 0.3);
        })
        .on("mouseleave", function() {
          d3.select(this).select(".planetGlow")
            .transition()
            .duration(200)
            .attr("r", pl.size * 0.6)
            .attr("opacity", 0.2);
        });

      // Atmosphere glow (outer) - drawn first so it's behind
      planetGroup.append("circle")
        .attr("class", "planetGlow")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", pl.size * 0.6)
        .attr("fill", `url(#planetGlow${pl.level})`)
        .attr("opacity", 0.25);

      // Main planet sphere
      planetGroup.append("circle")
        .attr("class", "planetSphere")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", pl.size * 0.5)
        .attr("fill", `url(#planetGrad${pl.level})`)
        .attr("stroke", "rgba(255,255,255,0.15)")
        .attr("stroke-width", 1)
        .attr("filter", "url(#planetShadow)");

      // Surface texture pattern (subtle)
      const pattern = d3Defs.append("pattern")
        .attr("id", `planetPattern${pl.level}`)
        .attr("patternUnits", "userSpaceOnUse")
        .attr("width", pl.size)
        .attr("height", pl.size);

      pattern.append("circle")
        .attr("cx", pl.size * 0.3)
        .attr("cy", pl.size * 0.25)
        .attr("r", pl.size * 0.15)
        .attr("fill", "rgba(255,255,255,0.08)");

      pattern.append("circle")
        .attr("cx", pl.size * 0.7)
        .attr("cy", pl.size * 0.6)
        .attr("r", pl.size * 0.1)
        .attr("fill", "rgba(0,0,0,0.1)");

      planetGroup.append("circle")
        .attr("class", "planetTexture")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", pl.size * 0.5)
        .attr("fill", `url(#planetPattern${pl.level})`)
        .attr("opacity", 0.4);

      // Highlight shine (relative to group center at 0,0)
      planetGroup.append("ellipse")
        .attr("class", "planetShine")
        .attr("cx", -pl.size * 0.15)
        .attr("cy", -pl.size * 0.2)
        .attr("rx", pl.size * 0.25)
        .attr("ry", pl.size * 0.15)
        .attr("fill", "rgba(255,255,255,0.35)")
        .attr("opacity", 0.6);

      // Level label
      planetGroup.append("text")
        .attr("class", "planetLabel")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("x", 0)
        .attr("y", 0)
        .attr("fill", "rgba(255,255,255,0.95)")
        .attr("font-size", pl.size * 0.35)
        .attr("font-weight", "bold")
        .attr("pointer-events", "none")
        .text(pl.level);
    });

    // Verify planets were created
    const planetGroups = d3PlanetsGroup.selectAll(".planetGroup");
    console.log(`Created ${planetGroups.size()} planets`);
    
    if (planetGroups.size() === 0) {
      console.error('No planets were created!');
      // Fallback: try again after a short delay
      setTimeout(() => {
        if (d3PlanetsGroup.selectAll(".planetGroup").size() === 0) {
          console.error('Planets still not created after retry');
        }
      }, 500);
    }
  }

  // =========================================================
  // COLLISION DETECTION & PHYSICS
  // =========================================================
  function checkCollisions() {
    const dampingFactor = 0.95; // Energy loss on collision
    
    for (let i = 0; i < planetMeshes.length; i++) {
      for (let j = i + 1; j < planetMeshes.length; j++) {
        const mesh1 = planetMeshes[i];
        const mesh2 = planetMeshes[j];
        
        // Calculate distance between centers
        const dx = mesh1.position.x - mesh2.position.x;
        const dy = mesh1.position.y - mesh2.position.y;
        const dz = mesh1.position.z - mesh2.position.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        // Check if collision occurred
        const minDistance = mesh1.userData.radius + mesh2.userData.radius;
        
        if (distance < minDistance && distance > 0) {
          // Collision detected! Apply elastic collision physics
          
          // Normalize collision vector
          const nx = dx / distance;
          const ny = dy / distance;
          const nz = dz / distance;
          
          // Relative velocity
          const dvx = mesh1.userData.velocityX - mesh2.userData.velocityX;
          const dvy = mesh1.userData.velocityY - mesh2.userData.velocityY;
          const dvz = mesh1.userData.velocityZ - mesh2.userData.velocityZ;
          
          // Relative velocity in collision normal direction
          const dvn = dvx * nx + dvy * ny + dvz * nz;
          
          // Don't resolve if velocities are separating
          if (dvn > 0) continue;
          
          // Calculate impulse scalar (elastic collision)
          const m1 = mesh1.userData.mass;
          const m2 = mesh2.userData.mass;
          const impulse = (2 * dvn) / (m1 + m2);
          
          // Apply impulse to velocities (with damping)
          mesh1.userData.velocityX -= impulse * m2 * nx * dampingFactor;
          mesh1.userData.velocityY -= impulse * m2 * ny * dampingFactor;
          mesh1.userData.velocityZ -= impulse * m2 * nz * dampingFactor;
          
          mesh2.userData.velocityX += impulse * m1 * nx * dampingFactor;
          mesh2.userData.velocityY += impulse * m1 * ny * dampingFactor;
          mesh2.userData.velocityZ += impulse * m1 * nz * dampingFactor;
          
          // Separate overlapping planets
          const overlap = minDistance - distance;
          const separationX = nx * overlap * 0.5;
          const separationY = ny * overlap * 0.5;
          const separationZ = nz * overlap * 0.5;
          
          mesh1.position.x += separationX;
          mesh1.position.y += separationY;
          mesh1.position.z += separationZ;
          
          mesh2.position.x -= separationX;
          mesh2.position.y -= separationY;
          mesh2.position.z -= separationZ;
          
          // Update base positions after separation
          mesh1.userData.xPosition = mesh1.position.x;
          mesh1.userData.yPosition = mesh1.position.y;
          mesh1.userData.zPosition = mesh1.position.z;
          
          mesh2.userData.xPosition = mesh2.position.x;
          mesh2.userData.yPosition = mesh2.position.y;
          mesh2.userData.zPosition = mesh2.position.z;
          
          // Visual feedback: slight scale pulse on collision
          mesh1.scale.setScalar(1.1);
          mesh2.scale.setScalar(1.1);
          setTimeout(() => {
            mesh1.scale.setScalar(1.0);
            mesh2.scale.setScalar(1.0);
          }, 100);
        }
      }
    }
  }

  function startOrbitAnimation() {
    if (planetAnimationId) {
      cancelAnimationFrame(planetAnimationId);
    }

    let lastTs = performance.now();

    const animate = (ts) => {
      const dt = Math.max(0, Math.min(100, ts - lastTs)); // Cap dt to prevent large jumps
      lastTs = ts;

      // Update planet positions (static line with floating animation)
      planetMeshes.forEach((mesh) => {
        const userData = mesh.userData;
        
        // Apply velocity perturbations (collision effects)
        const velocityDamping = 0.995;
        userData.velocityX *= velocityDamping;
        userData.velocityY *= velocityDamping;
        userData.velocityZ *= velocityDamping;
        
        // Subtle floating animation (vertical bobbing)
        const floatOffset = Math.sin(ts * userData.floatSpeed + userData.floatPhase) * userData.floatAmplitude;
        
        // Position: base position + floating + collision effects
        mesh.position.set(
          userData.xPosition + userData.velocityX * dt,
          userData.yPosition + floatOffset + userData.velocityY * dt,
          userData.zPosition + userData.velocityZ * dt
        );
        
        // 자전 (Self-rotation on own axis)
        mesh.rotation.y += userData.rotationSpeed * dt;
        
        // Gentle swaying motion for natural feel
        mesh.rotation.x = Math.sin(ts * userData.floatSpeed * 0.5) * 0.02;
        mesh.rotation.z = Math.cos(ts * userData.floatSpeed * 0.6) * 0.02;
      });

      // Check for collisions and apply physics
      checkCollisions();

      // Animate star fields (slow rotation for depth)
      starFields.forEach((starField, index) => {
        starField.rotation.y += starField.userData.rotSpeed * dt;
        starField.rotation.x += starField.userData.rotSpeed * 0.3 * dt;
      });

      // Dynamic camera movement to observe 3x3 grid
      const cameraAngle = ts * 0.00002; // Gentle circular motion
      
      // Camera with smooth orbital movement around the grid
      camera.position.x = 100 + Math.sin(cameraAngle) * 120; // Horizontal orbit
      camera.position.y = 250 + Math.cos(cameraAngle * 0.8) * 50; // Gentle vertical movement
      camera.position.z = 850 + Math.cos(cameraAngle * 0.5) * 50; // Subtle depth variation
      
      // Always look at the center of the 3x3 grid
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      planetAnimationId = requestAnimationFrame(animate);
    };

    planetAnimationId = requestAnimationFrame(animate);
  }

  function applyPaletteToPlanets() {
    if (!planetMeshes || planetMeshes.length === 0) return;

    console.log('Applying palette to planets with analyzed data...');

    // Update planet textures with new palette
    planetMeshes.forEach((mesh, idx) => {
      const pl = state.planets[idx];
      const col = getLevelColor(pl.level);
      pl.color = hsvToCss(col);
      pl.hsv = col;

      // Create new striped texture
      const newTexture = createStripedTexture(pl.level);
      mesh.material.map = newTexture;
      mesh.material.needsUpdate = true;
      
      // Update emissive color
      mesh.material.emissive.setHSL(col.h / 360, col.s, col.v * 0.2);
    });

    renderTable();
    renderCharts();
    renderGallery();
  }

  // Filter functions removed (no filtering feature)

  // =========================================================
  // DATA + GALLERY
  // =========================================================
  function rebuildAll() {
    renderTable();
    renderCharts();
    renderGallery();
    updateStatsWidget();
  }

  function recomputeAggregates() {
    state.aggregates = makeEmptyAggregates();

    for (const sc of state.scenes) {
      const lv = sc.level;
      
      // Validate level is in range 1-9
      if (!lv || lv < 1 || lv > 9) {
        console.warn('Invalid level for scene:', sc);
        continue;
      }
      
      const a = state.aggregates[lv];
      
      // Safety check
      if (!a) {
        console.error('Aggregate object missing for level:', lv);
        continue;
      }

      a.count += 1;

      const s = sc.hsv.avgS;
      const v = sc.hsv.avgV;

      a.sMin = Math.min(a.sMin, s);
      a.sMax = Math.max(a.sMax, s);
      a.vMin = Math.min(a.vMin, v);
      a.vMax = Math.max(a.vMax, v);

      a.sSum += s;
      a.vSum += v;
    }

    for (let lv = 1; lv <= 9; lv++) {
      const a = state.aggregates[lv];
      if (a.count > 0) {
        a.sAvg = a.sSum / a.count;
        a.vAvg = a.vSum / a.count;
      } else {
        a.sMin = null; a.sMax = null; a.vMin = null; a.vMax = null;
        a.sAvg = null; a.vAvg = null;
      }
    }
  }

  function renderTable() {
    if (!svTableBody) {
      console.warn('renderTable: svTableBody not initialized');
      return;
    }
    
    svTableBody.innerHTML = "";

    for (let lv = 1; lv <= 9; lv++) {
      const col = hsvToCss(getLevelColor(lv));
      const a = state.aggregates[lv];
      
      // Safety check
      if (!a) {
        console.error('Aggregate missing for level:', lv);
        continue;
      }

      const tr = document.createElement("tr");

      const tdLevel = document.createElement("td");
      const levelDot = document.createElement("div");
      levelDot.className = "levelDot";
      levelDot.style.background = col;
      tdLevel.appendChild(levelDot);
      tdLevel.appendChild(document.createTextNode(`Level ${lv}`));

      const tdCount = document.createElement("td");
      tdCount.textContent = a.count;

      // Show actual S/V values instead of percentages
      const tdSMin = document.createElement("td");
      const tdSAvg = document.createElement("td");
      const tdSMax = document.createElement("td");
      
      const tdVMin = document.createElement("td");
      const tdVAvg = document.createElement("td");
      const tdVMax = document.createElement("td");

      if (a.count === 0 || a.sMin === null) {
        tdSMin.textContent = "—";
        tdSAvg.textContent = "—";
        tdSMax.textContent = "—";
        tdVMin.textContent = "—";
        tdVAvg.textContent = "—";
        tdVMax.textContent = "—";
      } else {
        // Use pre-calculated averages from aggregates
        tdSMin.textContent = a.sMin.toFixed(1);
        tdSAvg.textContent = (a.sAvg ?? 0).toFixed(1);
        tdSMax.textContent = a.sMax.toFixed(1);
        
        tdVMin.textContent = a.vMin.toFixed(1);
        tdVAvg.textContent = (a.vAvg ?? 0).toFixed(1);
        tdVMax.textContent = a.vMax.toFixed(1);
      }

      tr.append(tdLevel, tdCount, tdSMin, tdSAvg, tdSMax, tdVMin, tdVAvg, tdVMax);
      svTableBody.appendChild(tr);
    }
  }

  function renderCharts() {
    if (!countChart || !svChart) {
      console.warn('renderCharts: chart canvases not initialized');
      return;
    }
    // Draw charts without filtering
    drawCountChart(countChart, state.aggregates, null);
    drawSVChart(svChart, state.aggregates, null);
  }

  function renderGallery() {
    if (!galleryGrid || !galleryEmpty || !gallerySearch || !gallerySort) {
      console.warn('renderGallery: gallery elements not initialized');
      return;
    }
    
    const q = (gallerySearch.value || "").trim().toLowerCase();
    const sortMode = gallerySort.value;

    let items = [...state.scenes];

    // search
    if (q) {
      items = items.filter(s => (s.title || "").toLowerCase().includes(q));
    }

    // sort
    items.sort((a,b) => {
      if (sortMode === "newest") return b.createdAt - a.createdAt;
      if (sortMode === "oldest") return a.createdAt - b.createdAt;
      if (sortMode === "levelHigh") return b.level - a.level || (b.createdAt - a.createdAt);
      if (sortMode === "levelLow") return a.level - b.level || (b.createdAt - a.createdAt);
      return b.createdAt - a.createdAt;
    });

    // Store filtered/sorted items
    state.gallery.allItems = items;
    state.gallery.loadedCount = 0;

    // Clear gallery and reset
    galleryGrid.innerHTML = "";
    galleryEmpty.style.display = items.length ? "none" : "block";
    
    // Hide loading indicator initially
    if (galleryLoading) {
      galleryLoading.style.display = "none";
    }

    // Load initial batch
    loadMoreGalleryItems();
  }

  function loadMoreGalleryItems() {
    if (state.gallery.isLoading) return;
    
    const { allItems, loadedCount, itemsPerPage } = state.gallery;
    
    if (loadedCount >= allItems.length) {
      // All items loaded
      if (galleryLoading) {
        galleryLoading.style.display = "none";
      }
      return;
    }

    state.gallery.isLoading = true;

    // Show loading indicator
    if (galleryLoading) {
      galleryLoading.style.display = "block";
    }

    // Calculate how many items to load
    const endIndex = Math.min(loadedCount + itemsPerPage, allItems.length);
    const itemsToLoad = allItems.slice(loadedCount, endIndex);

    console.log(`Loading gallery items ${loadedCount + 1}-${endIndex} of ${allItems.length}`);

    // Simulate async loading (for smooth UX)
    setTimeout(() => {
      // Render items
      for (const it of itemsToLoad) {
        const col = hsvToCss(getLevelColor(it.level));

        const card = document.createElement("div");
        card.className = "gItem";
        card.dataset.id = it.id;

        card.innerHTML = `
          <img class="gThumb" alt="scene thumbnail" src="${it.thumb}">
          <div class="gMeta">
            <div class="gTitle">${escapeHtml(it.title)}</div>
            <div class="gSub">
              <div class="gLevel"><span class="gLevelDot" style="background:${col}"></span> Lv ${it.level}</div>
              <div>${formatDate(it.createdAt)}</div>
            </div>
          </div>
        `;

        // click -> toggle "active" highlight (visual selection)
        card.addEventListener("click", () => {
          card.classList.toggle("gItem--active");
        });

        galleryGrid.appendChild(card);
      }

      // Update loaded count
      state.gallery.loadedCount = endIndex;
      state.gallery.isLoading = false;

      // Hide loading indicator
      if (galleryLoading) {
        galleryLoading.style.display = "none";
      }

      console.log(`Gallery: ${endIndex}/${allItems.length} items loaded`);
    }, 100); // Small delay for smooth loading
  }

  // =========================================================
  // POSTER / HSV UTIL
  // =========================================================
  function setPosterPreview(file, imgEl, frameEl) {
    if (!file) return;
    if (!imgEl || !frameEl) {
      console.warn('setPosterPreview: missing elements', { imgEl, frameEl });
      return;
    }
    
    const url = URL.createObjectURL(file);
    imgEl.onload = () => URL.revokeObjectURL(url);
    imgEl.src = url;
    imgEl.style.display = "block";
    
    // Try multiple possible placeholder selectors
    const placeholder = frameEl.querySelector(".posterPreview__placeholder") || 
                       frameEl.querySelector(".scenePreview__placeholder");
    if (placeholder) {
      placeholder.style.display = "none";
    }
  }
  
  function hidePreview(imgEl, frameEl){
    if (!imgEl || !frameEl) return;
    
    imgEl.style.display = "none";
    imgEl.src = "";
    
    // Try multiple possible placeholder selectors
    const placeholder = frameEl.querySelector(".posterPreview__placeholder") || 
                       frameEl.querySelector(".scenePreview__placeholder");
    if (placeholder) {
      placeholder.style.display = "flex";
    }
  }

  function renderPaletteSwatches(palette) {
    // Render spectrum canvas
    renderPaletteSpectrum(palette);
    
    // Render swatches
    posterPaletteRow.innerHTML = "";
    palette.forEach((hsv) => {
      const swatchWrapper = document.createElement("div");
      swatchWrapper.style.display = "inline-block";
      swatchWrapper.style.position = "relative";
      
      const sw = document.createElement("div");
      sw.className = "swatch";
      sw.style.background = hsvToCss(hsv);
      
      // Add label for achromatic colors
      if (hsv.h < 0) {
        const label = document.createElement("div");
        label.style.position = "absolute";
        label.style.bottom = "-18px";
        label.style.left = "50%";
        label.style.transform = "translateX(-50%)";
        label.style.fontSize = "10px";
        label.style.color = "rgba(255,255,255,0.5)";
        label.style.whiteSpace = "nowrap";
        
        if (hsv.h === -1) label.textContent = "White";
        else if (hsv.h === -2) label.textContent = "Black";
        else if (hsv.h === -3) label.textContent = "Gray";
        
        swatchWrapper.appendChild(label);
      }
      
      swatchWrapper.appendChild(sw);
      posterPaletteRow.appendChild(swatchWrapper);
    });
  }

  function renderPaletteSpectrum(palette) {
    const canvas = document.getElementById("paletteSpectrumCanvas");
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, W, H);
    
    if (!palette || palette.length === 0) {
      // Draw empty state
      ctx.fillStyle = "rgba(255,255,255,.08)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,.3)";
      ctx.font = "14px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Upload a poster to display the color spectrum", W/2, H/2);
      return;
    }
    
    // Separate chromatic and achromatic colors
    const chromaticColors = palette.filter(hsv => hsv.h >= 0);
    const achromaticColors = palette.filter(hsv => hsv.h < 0);
    
    // Sort chromatic colors by hue for smooth spectrum
    const sortedPalette = [...chromaticColors].sort((a, b) => a.h - b.h);
    
    // Add achromatic colors at the end
    const fullPalette = [...sortedPalette, ...achromaticColors];
    
    // Create smooth gradient spectrum (chromatic only)
    if (sortedPalette.length > 0) {
      const gradient = ctx.createLinearGradient(0, 0, W, 0);
      
      // Add color stops
      sortedPalette.forEach((hsv, i) => {
        const position = i / Math.max(1, sortedPalette.length - 1);
        gradient.addColorStop(position, hsvToCss(hsv));
      });
      
      // Draw main spectrum
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H * 0.7);
      
      // Add subtle gradient overlay for depth
      const overlayGradient = ctx.createLinearGradient(0, 0, 0, H * 0.7);
      overlayGradient.addColorStop(0, "rgba(255,255,255,0.15)");
      overlayGradient.addColorStop(0.5, "rgba(255,255,255,0)");
      overlayGradient.addColorStop(1, "rgba(0,0,0,0.25)");
      ctx.fillStyle = overlayGradient;
      ctx.fillRect(0, 0, W, H * 0.7);
    }
    
    // Draw individual color segments at bottom (all colors)
    const segmentWidth = W / fullPalette.length;
    fullPalette.forEach((hsv, i) => {
      const x = i * segmentWidth;
      const y = H * 0.72;
      const h = H * 0.28;
      
      // Draw color segment
      ctx.fillStyle = hsvToCss(hsv);
      ctx.fillRect(x, y, segmentWidth, h);
      
      // Add separator
      if (i > 0) {
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      
      // Add hue label
      ctx.fillStyle = hsv.v > 0.5 ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.9)";
      ctx.font = "11px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(Math.round(hsv.h * 360) + "°", x + segmentWidth/2, y + h/2);
    });
  }

  function extractDominantHuePalette(img, k=8) {
    // Downscale to manageable size
    const maxW = 240;
    const scale = Math.min(1, maxW / img.width);
    const w = Math.max(2, Math.floor(img.width * scale));
    const h = Math.max(2, Math.floor(img.height * scale));

    workCanvas.width = w;
    workCanvas.height = h;
    wctx.clearRect(0,0,w,h);
    wctx.drawImage(img, 0, 0, w, h);

    const data = wctx.getImageData(0,0,w,h).data;

    // Hue histogram (0..359), weighted by saturation and value to reduce noise
    const bins = new Array(360).fill(0);
    const pixelCounts = new Array(360).fill(0); // Track pixel count per hue
    let totalValidPixels = 0;

    for (let i=0; i<data.length; i+=4){
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a < 180) continue;

      const hsv = rgbToHsv(r,g,b);

      // IMPROVED: Much stricter filtering to ignore gray/low saturation pixels
      // Only include vibrant, saturated colors
      if (hsv.s < 0.25 || hsv.v < 0.15) continue; // Increased from 0.12 and 0.10
      
      // Additional filter: Reject pixels that are too dark or too bright (likely noise)
      if (hsv.v < 0.20 || hsv.v > 0.95) continue;

      const hi = Math.max(0, Math.min(359, Math.round(hsv.h)));
      
      // Enhanced weighting: Give much more weight to highly saturated colors
      const saturationWeight = Math.pow(hsv.s, 2); // Quadratic weighting for saturation
      const valueWeight = hsv.v * (1.0 - Math.abs(hsv.v - 0.5) * 0.3); // Prefer mid-range values
      
      bins[hi] += saturationWeight * valueWeight * 100;
      pixelCounts[hi] += 1;
      totalValidPixels += 1;
    }

    console.log(`✓ Valid colored pixels: ${totalValidPixels} / ${data.length/4} (${(totalValidPixels/(data.length/4)*100).toFixed(1)}%)`);

    // Calculate minimum threshold: Only include colors that appear in at least 0.5% of valid pixels
    const minPixelThreshold = Math.max(5, totalValidPixels * 0.005);
    
    // pick top k peaks with minimum distance
    const picked = [];
    const used = new Array(360).fill(false);
    const minDist = 20; // Slightly increased from 18 for better separation

    for (let t=0; t<k; t++){
      let bestH = -1, bestV = -1;
      for (let h=0; h<360; h++){
        if (used[h]) continue;
        
        // IMPROVED: Only consider hues with significant pixel count
        if (pixelCounts[h] < minPixelThreshold) continue;
        
        if (bins[h] > bestV) { 
          bestV = bins[h]; 
          bestH = h; 
        }
      }
      if (bestH < 0 || bestV <= 0) break;

      // Log the selected color for debugging
      console.log(`  Color ${t+1}: Hue ${bestH}° (${pixelCounts[bestH]} pixels, weight: ${bestV.toFixed(2)})`);

      picked.push(bestH);

      for (let d=-minDist; d<=minDist; d++){
        used[(bestH + d + 360) % 360] = true;
      }
    }

    // If we didn't find enough colors, it means the image is mostly gray/low saturation
    if (picked.length < 3) {
      console.warn('⚠ Warning: Only found', picked.length, 'distinct colors. Image may be low saturation.');
    }

    // convert to HSV palette (use moderate S/V)
    // also sort by hue for stable gradient feeling
    picked.sort((a,b)=>a-b);

    const palette = picked.map(hh => ({
      h: hh,
      s: 0.58,
      v: 0.70
    }));

    console.log(`✓ Final palette: ${palette.length} colors extracted`);

    return palette;
  }

  function computeHSVSummary(img) {
    // sample pixels at grid (fast, stable)
    if (!workCanvas || !wctx) {
      console.error('workCanvas or wctx not initialized!');
      throw new Error('Canvas not initialized');
    }
    
    const maxW = 260;
    const scale = Math.min(1, maxW / img.width);
    const w = Math.max(2, Math.floor(img.width * scale));
    const h = Math.max(2, Math.floor(img.height * scale));

    workCanvas.width = w;
    workCanvas.height = h;
    wctx.clearRect(0,0,w,h);
    wctx.drawImage(img, 0, 0, w, h);

    const data = wctx.getImageData(0,0,w,h).data;

    let sSum=0, vSum=0, cnt=0;
    const hueBins = new Array(360).fill(0);

    // step sampling
    const step = Math.max(1, Math.floor(Math.min(w,h)/90));

    for (let y=0; y<h; y+=step){
      for (let x=0; x<w; x+=step){
        const idx = (y*w + x)*4;
        const a = data[idx+3];
        if (a < 200) continue;
        const r = data[idx], g = data[idx+1], b = data[idx+2];
        const hsv = rgbToHsv(r,g,b);

        // keep most pixels but softly ignore extreme dark
        if (hsv.v < 0.08) continue;

        sSum += hsv.s;
        vSum += hsv.v;
        cnt++;

        const hi = Math.max(0, Math.min(359, Math.round(hsv.h)));
        hueBins[hi] += (0.3 + hsv.s) * (0.3 + hsv.v);
      }
    }

    const avgS = cnt ? (sSum/cnt) : 0;
    const avgV = cnt ? (vSum/cnt) : 0;

    let domH = 0, best = -1;
    for (let i=0;i<360;i++){
      if (hueBins[i] > best){
        best = hueBins[i];
        domH = i;
      }
    }

    return { avgS, avgV, domH };
  }

  // =========================================================
  // LEVEL COLOR MAPPING
  // =========================================================
  function getLevelColor(level) {
    // map level 1..9 -> base palette + adjust brightness/saturation
    // We blend two palette hues to create smoother spectrum.
    const t = (level - 1) / 8; // 0..1
    const p = state.basePalette;
    const n = p.length;

    const idx = t * (n - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(n - 1, i0 + 1);
    const f = idx - i0;

    const a = p[i0];
    const b = p[i1];

    // interpolate hue in circular space
    const h = lerpHue(a.h, b.h, f);

    // Get aggregate data for this level
    const agg = state.aggregates[level];
    
    // Use actual analyzed SV values if available
    if (agg && agg.count > 0 && agg.sAvg !== null && agg.vAvg !== null) {
      // Strategy: Amplify differences from mean while preserving real data trends
      // If real data shows level 9 > level 5 > level 1, maintain that order but exaggerate
      
      // Calculate mean S/V across all levels with data
      let sSum = 0, vSum = 0, count = 0;
      for (let lv = 1; lv <= 9; lv++) {
        const lvAgg = state.aggregates[lv];
        if (lvAgg && lvAgg.count > 0 && lvAgg.sAvg !== null && lvAgg.vAvg !== null) {
          sSum += lvAgg.sAvg;
          vSum += lvAgg.vAvg;
          count++;
        }
      }
      
      const sMean = count > 0 ? sSum / count : 0.5;
      const vMean = count > 0 ? vSum / count : 0.5;
      
      // Calculate deviation from mean
      const sDeviation = agg.sAvg - sMean;
      const vDeviation = agg.vAvg - vMean;
      
      // Amplify deviation by 2.0x for dramatic effect
      // This preserves the real data relationship while exaggerating differences
      const amplificationFactor = 2.0;
      
      // Apply amplified deviation
      const s = clamp01(sMean + (sDeviation * amplificationFactor));
      const v = clamp01(vMean + (vDeviation * amplificationFactor));
      
      // DIMMED: Lower overall brightness by 30%
      const sDimmed = s * 0.9; // Reduce saturation slightly
      const vDimmed = v * 0.7; // Reduce brightness significantly
      
      // Ensure minimum visibility (lower thresholds)
      const sVisible = Math.max(0.15, sDimmed); // Min 0.15 (lowered from 0.25)
      const vVisible = Math.max(0.20, vDimmed); // Min 0.20 (lowered from 0.30)
      
      console.log(`Level ${level}: Real S=${agg.sAvg.toFixed(3)} V=${agg.vAvg.toFixed(3)} | Mean S=${sMean.toFixed(3)} V=${vMean.toFixed(3)} | Dev S=${sDeviation.toFixed(3)} V=${vDeviation.toFixed(3)} → DIMMED: S=${sVisible.toFixed(3)} V=${vVisible.toFixed(3)}`);
      
      return { h, s: sVisible, v: vVisible };
    }
    
    // Fallback: level -> mood curve (when no data available)
    // EXAGGERATED non-linear curve for dramatic difference
    const satBoost = 0.35 + (t * t * 0.50);   // 0.35..0.85 (exponential)
    const valBoost = 0.30 + (t * t * 0.60);   // 0.30..0.90 (exponential)

    // Dramatic blend with base palette
    const s = clamp01((a.s*(1-f) + b.s*f) * 0.5 + satBoost * 0.5);
    const v = clamp01((a.v*(1-f) + b.v*f) * 0.4 + valBoost * 0.6);

    return { h, s, v };
  }

  // =========================================================
  // CHARTS (CANVAS)
  // =========================================================
  function drawCountChart(canvas, aggs, highlightLevel) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);

    // background
    roundedRect(ctx, 8, 8, W-16, H-16, 14);
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.fill();

    const pad = { l: 36, r: 16, t: 20, b: 26 };
    const x0 = pad.l, x1 = W - pad.r;
    const y0 = pad.t, y1 = H - pad.b;

    // max count
    let maxC = 1;
    for (let lv=1; lv<=9; lv++) {
      if (aggs[lv]) maxC = Math.max(maxC, aggs[lv].count);
    }

    // axes lines
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y1);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    const bw = (x1 - x0) / 9;
    for (let lv=1; lv<=9; lv++){
      if (!aggs[lv]) continue;
      const c = aggs[lv].count;
      const h = (c / maxC) * (y1 - y0);
      const bx = x0 + (lv-1)*bw + bw*0.18;
      const by = y1 - h;
      const w = bw*0.64;

      const col = hsvToCss(getLevelColor(lv));
      const isHi = highlightLevel === lv;

      // bar
      roundedRect(ctx, bx, by, w, h, 10);
      ctx.fillStyle = isHi ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.10)";
      ctx.fill();

      roundedRect(ctx, bx, by, w, h, 10);
      ctx.fillStyle = col;
      ctx.globalAlpha = isHi ? 0.92 : 0.62;
      ctx.fill();
      ctx.globalAlpha = 1;

      // label
      ctx.fillStyle = "rgba(255,255,255,.68)";
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.fillText(String(lv), bx + w/2, y1 + 18);
    }

    // title
    ctx.fillStyle = "rgba(255,255,255,.78)";
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.textAlign = "left";
    ctx.fillText("Level Count", x0, 18);
  }

  function drawSVChart(canvas, aggs, highlightLevel) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);

    roundedRect(ctx, 8, 8, W-16, H-16, 14);
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.fill();

    const pad = { l: 36, r: 16, t: 22, b: 30 };
    const x0 = pad.l, x1 = W - pad.r;
    const y0 = pad.t, y1 = H - pad.b;

    // y=0..1 (representing 0..255)
    const bw = (x1 - x0) / 9;

    // axis
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y1);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // Y-axis labels (0, 128, 255)
    ctx.fillStyle = "rgba(255,255,255,.50)";
    ctx.font = "10px ui-sans-serif, system-ui";
    ctx.textAlign = "right";
    
    // 255 (top)
    ctx.fillText("255", x0 - 4, y0 + 4);
    
    // 128 (middle)
    const yMid = y0 + (y1 - y0) / 2;
    ctx.fillText("128", x0 - 4, yMid + 4);
    
    // 0 (bottom)
    ctx.fillText("0", x0 - 4, y1 + 4);
    
    // Mid reference line
    ctx.strokeStyle = "rgba(255,255,255,.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, yMid);
    ctx.lineTo(x1, yMid);
    ctx.stroke();

    // draw S and V as two thin bars per level
    for (let lv=1; lv<=9; lv++){
      const a = aggs[lv];
      if (!a) continue;
      const sAvg = a.sAvg ?? 0;
      const vAvg = a.vAvg ?? 0;

      const bx = x0 + (lv-1)*bw + bw*0.16;
      const w = bw*0.68;
      const col = hsvToCss(getLevelColor(lv));
      const isHi = highlightLevel === lv;

      // S bar (normalize 0-255 to 0-1)
      const sNormalized = sAvg / 255;
      const sH = sNormalized * (y1 - y0);
      const sY = y1 - sH;
      roundedRect(ctx, bx, sY, w*0.48, sH, 9);
      ctx.fillStyle = col;
      ctx.globalAlpha = isHi ? 0.92 : 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;

      // V bar (normalize 0-255 to 0-1)
      const vNormalized = vAvg / 255;
      const vH = vNormalized * (y1 - y0);
      const vY = y1 - vH;
      roundedRect(ctx, bx + w*0.52, vY, w*0.48, vH, 9);
      ctx.fillStyle = "rgba(255,255,255,.70)";
      ctx.globalAlpha = isHi ? 0.85 : 0.32;
      ctx.fill();
      ctx.globalAlpha = 1;

      // x labels
      ctx.fillStyle = "rgba(255,255,255,.68)";
      ctx.font = "12px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.fillText(String(lv), bx + w/2, y1 + 20);
    }

    // legend (S vs V)
    ctx.fillStyle = "rgba(255,255,255,.78)";
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.textAlign = "left";
    ctx.fillText("avg S (colored) / avg V (white)", x0, 18);
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  }

  // =========================================================
  // BACKEND API
  // =========================================================
  async function loadFromBackend() {
    try {
      console.log('Loading data from Django backend...');
      
      // Load poster palette
      try {
        const paletteResp = await fetch('/api/poster/palette/');
        if (paletteResp.ok) {
          const paletteData = await paletteResp.json();
          if (paletteData.palette && paletteData.palette.length > 0) {
            state.basePalette = paletteData.palette;
            renderPaletteSwatches(state.basePalette);
            console.log('✓ Loaded palette:', paletteData.palette.length, 'colors');
          }
        }
      } catch (e) {
        console.warn('Failed to load palette:', e);
      }
      
      // Render empty spectrum if no palette
      if (!state.basePalette || state.basePalette.length === 0) {
        renderPaletteSpectrum([]);
      }
      
      // Load gallery (all scenes)
      try {
        const galleryResp = await fetch('/api/gallery/?page_size=10000');
        if (galleryResp.ok) {
          const galleryData = await galleryResp.json();
          if (galleryData.scenes && galleryData.scenes.length > 0) {
            state.scenes = galleryData.scenes.map(scene => ({
              id: scene.id,
              title: scene.title,
              level: scene.level,
              createdAt: new Date(scene.created_at).getTime(),
              thumb: scene.image_url,
              hsv: {
                avgS: scene.hsv.avgS || 0,
                avgV: scene.hsv.avgV || 0,
                domH: scene.hsv.domH || 0
              }
            }));
            console.log('✓ Loaded scenes:', state.scenes.length);
            recomputeAggregates();
          }
        }
      } catch (e) {
        console.warn('Failed to load gallery:', e);
      }
      
    } catch (e) {
      console.error('Failed to load from backend:', e);
    }
  }

  // =========================================================
  // STORAGE (backup/cache)
  // =========================================================
  function saveToStorage() {
    const compact = {
      basePalette: state.basePalette
    };
    localStorage.setItem(LS_KEY, JSON.stringify(compact));
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed.basePalette) && parsed.basePalette.length) {
        state.basePalette = parsed.basePalette;
      }
    } catch {
      // ignore
    }
  }

  // =========================================================
  // HELPERS
  // =========================================================
  function makeEmptyAggregates() {
    const aggs = {};
    for (let lv=1; lv<=9; lv++){
      aggs[lv] = {
        count: 0,
        sMin: null, sMax: null,
        vMin: null, vMax: null,
        sSum: 0, vSum: 0,
        sAvg: null, vAvg: null
      };
      // internal init for mins/maxs
      aggs[lv].sMin = Infinity;
      aggs[lv].sMax = -Infinity;
      aggs[lv].vMin = Infinity;
      aggs[lv].vMax = -Infinity;
    }
    // after fill, null them if count==0 in recompute
    return aggs;
  }

  function fileToDataURL(file) {
    return new Promise((res, rej) => {
      if (!file) {
        rej(new Error('No file provided'));
        return;
      }
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = (e) => {
        console.error('FileReader error:', e);
        rej(new Error('Failed to read file'));
      };
      fr.readAsDataURL(file);
    });
  }

  function dataURLToImage(dataURL) {
    return new Promise((res, rej) => {
      if (!dataURL) {
        rej(new Error('No dataURL provided'));
        return;
      }
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = (e) => {
        console.error('Image load error:', e);
        rej(new Error('Failed to load image'));
      };
      img.src = dataURL;
    });
  }

  function rgbToHsv(r, g, b) {
    // r,g,b: 0..255 -> hsv: h 0..359, s 0..1, v 0..1
    const rr = r / 255, gg = g / 255, bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const d = max - min;

    let h = 0;
    if (d === 0) h = 0;
    else if (max === rr) h = 60 * (((gg - bb) / d) % 6);
    else if (max === gg) h = 60 * (((bb - rr) / d) + 2);
    else h = 60 * (((rr - gg) / d) + 4);

    if (h < 0) h += 360;

    const s = max === 0 ? 0 : d / max;
    const v = max;

    return { h, s, v };
  }

  function hsvToRgb(h, s, v) {
    // Handle achromatic colors (negative hue values)
    if (h < 0) {
      // -1: White, -2: Black, -3: Gray
      const gray = Math.round(v * 255);
      return { r: gray, g: gray, b: gray };
    }
    
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let r=0,g=0,b=0;
    if (0 <= h && h < 60) { r=c; g=x; b=0; }
    else if (60 <= h && h < 120) { r=x; g=c; b=0; }
    else if (120 <= h && h < 180) { r=0; g=c; b=x; }
    else if (180 <= h && h < 240) { r=0; g=x; b=c; }
    else if (240 <= h && h < 300) { r=x; g=0; b=c; }
    else { r=c; g=0; b=x; }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  }

  function hsvToCss(hsv) {
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }

  function lerp(a,b,t){ return a + (b-a)*t; }
  function clamp01(x){ return Math.max(0, Math.min(1, x)); }

  function lerpHue(h0, h1, t) {
    // Handle achromatic colors (no interpolation for negative hues)
    if (h0 < 0 && h1 < 0) return h0; // Both achromatic, keep first
    if (h0 < 0) return h1; // First is achromatic, use second
    if (h1 < 0) return h0; // Second is achromatic, use first
    
    // shortest angular interpolation for chromatic colors
    const a = ((h0 % 360) + 360) % 360;
    const b = ((h1 % 360) + 360) % 360;
    let d = b - a;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return (a + d * t + 360) % 360;
  }

  function toPct(x){
    const v = Math.round(clamp01(x) * 100);
    return `${v}%`;
  }

  function formatDate(ts){
    const d = new Date(ts);
    const yy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    return `${yy}.${mm}.${dd}`;
  }

  function cryptoLikeId(){
    return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  // =========================================================
  // STATISTICAL ANALYSIS
  // =========================================================
  
  function updateStatsWidget() {
    const statTotalScenes = document.getElementById('statTotalScenes');
    const statAvgLevel = document.getElementById('statAvgLevel');
    const statAvgS = document.getElementById('statAvgS');
    const statAvgV = document.getElementById('statAvgV');

    if (!statTotalScenes || !statAvgLevel || !statAvgS || !statAvgV) {
      return;
    }

    const totalScenes = state.scenes.length;
    statTotalScenes.textContent = totalScenes;

    if (totalScenes === 0) {
      statAvgLevel.textContent = '-';
      statAvgS.textContent = '-';
      statAvgV.textContent = '-';
      return;
    }

    // Calculate averages
    let levelSum = 0;
    let sSum = 0;
    let vSum = 0;
    let validCount = 0;

    for (const scene of state.scenes) {
      levelSum += scene.level;
      if (scene.hsv && scene.hsv.avgS !== null && scene.hsv.avgV !== null) {
        sSum += scene.hsv.avgS;
        vSum += scene.hsv.avgV;
        validCount++;
      }
    }

    const avgLevel = (levelSum / totalScenes).toFixed(1);
    const avgS = validCount > 0 ? (sSum / validCount).toFixed(1) : '-';
    const avgV = validCount > 0 ? (vSum / validCount).toFixed(1) : '-';

    statAvgLevel.textContent = avgLevel;
    statAvgS.textContent = avgS;
    statAvgV.textContent = avgV;
  }

  async function analyzeCorrelation() {
    const analyzeBtn = document.getElementById('analyzeCorrelationBtn');
    const resultsDiv = document.getElementById('correlationResults');
    const corrHue = document.getElementById('corrHue');
    const corrSaturation = document.getElementById('corrSaturation');
    const corrValue = document.getElementById('corrValue');
    const corrInterpretation = document.getElementById('corrInterpretation');

    if (!analyzeBtn || !resultsDiv) {
      console.error('Correlation analysis elements not found');
      return;
    }

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = '분석 중...';

    try {
      const response = await fetch('/api/statistics/correlation/');
      
      if (!response.ok) {
        throw new Error('Correlation analysis request failed');
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Display correlation results
      if (corrHue) {
        const h = data.correlation.hue;
        corrHue.innerHTML = `
          <strong>correlation coefficient (r):</strong> ${h.r}<br>
          <strong>p-value:</strong> ${h.p}<br>
          <strong>significance:</strong> ${h.significance === 'significant' ? 'significant ✓' : 'not significant'}<br>
          <strong>strength:</strong> ${h.strength} (${h.direction})
        `;
      }

      if (corrSaturation) {
        const s = data.correlation.saturation;
        corrSaturation.innerHTML = `
          <strong>correlation coefficient (r):</strong> ${s.r}<br>
          <strong>p-value:</strong> ${s.p}<br>
          <strong>significance:</strong> ${s.significance === 'significant' ? 'significant ✓' : 'not significant'}<br>
          <strong>strength:</strong> ${s.strength} (${s.direction})<br>
          <strong>regression equation:</strong> S = ${data.regression.saturation.slope.toFixed(2)} × Level + ${data.regression.saturation.intercept.toFixed(2)}<br>
          <strong>R²:</strong> ${data.regression.saturation.r_squared}
        `;
      }

      if (corrValue) {
        const v = data.correlation.value;
        corrValue.innerHTML = `
          <strong>correlation coefficient (r):</strong> ${v.r}<br>
          <strong>p-value:</strong> ${v.p}<br>
          <strong>significance:</strong> ${v.significance === 'significant' ? 'significant ✓' : 'not significant'}<br>
          <strong>strength:</strong> ${v.strength} (${v.direction})<br>
          <strong>regression equation:</strong> V = ${data.regression.value.slope.toFixed(2)} × Level + ${data.regression.value.intercept.toFixed(2)}<br>
          <strong>R²:</strong> ${data.regression.value.r_squared}
        `;
      }

      if (corrInterpretation && data.interpretation) {
        corrInterpretation.innerHTML = `
          <h4>${data.interpretation.summary}</h4>
          <ul>
            ${data.interpretation.key_findings.map(finding => `<li>${finding}</li>`).join('')}
          </ul>
        `;
      }

      resultsDiv.style.display = 'block';
      console.log('✓ Correlation analysis completed', data);

    } catch (e) {
      console.error('Correlation analysis failed:', e);
      alert(`correlation analysis failed: ${e.message}`);
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = 'run correlation analysis';
    }
  }

  async function downloadJSON() {
    try {
      const response = await fetch('/api/export/');
      
      if (!response.ok) {
        throw new Error('data export failed');
      }

      const data = await response.json();
      
      // Create blob and download
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cinematic_data_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('✓ JSON export completed');
    } catch (e) {
      console.error('JSON export failed:', e);
      alert(`JSON download failed: ${e.message}`);
    }
  }

})();
