/**
 * Kerala Mall - 3D Indoor Map Application
 * Using MapLibre GL JS for 3D visualization
 */

// ===== Configuration =====
const CONFIG = {
  center: [74.90425, 12.70621],
  zoom: 20,
  pitch: 40,
  bearing: 20,
  minZoom: 18,
  maxZoom: 22,
};

// Category colors for consistent styling
const CATEGORY_COLORS = {
  entrance: "#4A90D9",
  parking: "#6B7280",
  elevator: "#9CA3AF",
  security: "#DC2626",
  atm: "#059669",
  store: "#EC4899",
  corridor: "#F3F4F6",
  washroom: "#0EA5E9",
  info: "#6366F1",
  food: "#F97316",
  entertainment: "#7C3AED",
  seating: "#FCD34D",
  common: "#E8D5B7",
  building: "#1F2937",
};

// Category icons for labels
const CATEGORY_ICONS = {
  entrance: "🚪",
  parking: "🅿️",
  elevator: "🛗",
  security: "🛡️",
  atm: "💳",
  store: "🛍️",
  corridor: "🚶",
  washroom: "🚻",
  info: "ℹ️",
  food: "🍽️",
  entertainment: "🎮",
  seating: "🪑",
  common: "🏛️",
  building: "🏢",
};

// ===== Global State =====
let map = null;
let floorplanData = null;
let navGraph = null;
let currentFloor = 0;
let selectedRoom = null;
let hoveredFeatureId = null;
let animationId = null;
let dashOffset = 0;

// ===== DOM Elements =====
const elements = {
  loading: document.getElementById("loading"),
  floorButtons: document.querySelectorAll(".floor-btn"),
  roomInfo: document.getElementById("room-info"),
  roomName: document.getElementById("room-name"),
  roomCategory: document.getElementById("room-category"),
  roomDescription: document.getElementById("room-description"),
  navFrom: document.getElementById("nav-from"),
  navTo: document.getElementById("nav-to"),
  navigateBtn: document.getElementById("navigate-btn"),
  navResult: document.getElementById("nav-result"),
  closeNav: document.getElementById("close-nav"),
  setStartBtn: document.getElementById("set-start-btn"),
  setDestBtn: document.getElementById("set-dest-btn"),
  view3dBtn: document.getElementById("view-3d"),
  view2dBtn: document.getElementById("view-2d"),
};

// ===== Initialize Application =====
async function init() {
  try {
    const response = await fetch("mall-floorplan.geojson");
    const data = await response.json();
    
    floorplanData = { type: "FeatureCollection", features: data.features };
    navGraph = data.navGraph;
    
    initMap();
    populateNavigationOptions();
    setupEventListeners();
  } catch (error) {
    console.error("Failed to initialize:", error);
    alert("Failed to load mall data. Please refresh the page.");
  }
}

// ===== Initialize MapLibre Map =====
function initMap() {
  map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      name: "Kerala Mall Map",
      sources: {
        "carto-dark": {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"
          ],
          tileSize: 256,
          attribution: '&copy; OSM, &copy; CARTO'
        },
      },
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "#0F172A" },
        },
        {
          id: "carto-dark-layer",
          type: "raster",
          source: "carto-dark",
        },
      ],
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    },
    center: CONFIG.center,
    zoom: CONFIG.zoom,
    pitch: CONFIG.pitch,
    bearing: CONFIG.bearing,
    minZoom: CONFIG.minZoom,
    maxZoom: CONFIG.maxZoom,
    antialias: true,
  });

  map.addControl(
    new maplibregl.NavigationControl({
      showCompass: true,
      showZoom: true,
      visualizePitch: true,
    }),
    "top-right"
  );

  map.addControl(
    new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }),
    "bottom-left"
  );

  map.on("load", () => {
    addFloorplanLayers();
    hideLoading();
  });

  map.on("click", "room-extrusion", handleRoomClick);

  map.on("mousemove", "room-extrusion", (e) => {
    if (e.features.length > 0) {
      const feature = e.features[0];
      if (feature.properties.category === "building") return;
      if (feature.properties.isOutline) return;
      
      map.getCanvas().style.cursor = "pointer";

      // Clear previous hover state
      if (hoveredFeatureId !== null && hoveredFeatureId !== undefined) {
        map.setFeatureState(
          { source: "floorplan", id: hoveredFeatureId },
          { hover: false }
        );
      }

      // Set new hover state only if feature has an id
      const newId = e.features[0].id;
      if (newId !== null && newId !== undefined) {
        hoveredFeatureId = newId;
        map.setFeatureState(
          { source: "floorplan", id: hoveredFeatureId },
          { hover: true }
        );
      }
    }
  });

  map.on("mouseleave", "room-extrusion", () => {
    map.getCanvas().style.cursor = "";
    if (hoveredFeatureId !== null && hoveredFeatureId !== undefined) {
      map.setFeatureState(
        { source: "floorplan", id: hoveredFeatureId },
        { hover: false }
      );
      hoveredFeatureId = null;
    }
  });
}

// ===== Add Floorplan Layers =====
function addFloorplanLayers() {
  // Assign IDs for feature state
  floorplanData.features = floorplanData.features.map((feature, index) => {
    return { ...feature, id: index };
  });

  // Add floorplan source
  map.addSource("floorplan", {
    type: "geojson",
    data: floorplanData,
    promoteId: "id",
  });

  // Building outline - always visible line around building
  map.addLayer({
    id: "building-outline",
    type: "line",
    source: "floorplan",
    filter: ["==", ["get", "isOutline"], true],
    paint: {
      "line-color": "#60A5FA",
      "line-width": 3,
      "line-opacity": 0.8,
    },
  });

  // 3D extrusion layer for rooms
  map.addLayer({
    id: "room-extrusion",
    type: "fill-extrusion",
    source: "floorplan",
    filter: ["!=", ["get", "isOutline"], true],
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": ["get", "base_height"],
      "fill-extrusion-opacity": 0.6,
    },
  });

  // Create 3D labels using HTML markers on top of extrusions
  addStoreLabels();

  updateFloorFilter(currentFloor);
}

// ===== Add Store Labels using HTML Markers =====
let storeMarkers = [];

function addStoreLabels() {
  // Remove existing markers
  storeMarkers.forEach(item => item.marker.remove());
  storeMarkers = [];

  floorplanData.features.forEach(feature => {
    const props = feature.properties;
    
    // Skip outline and building features
    if (props.isOutline || props.category === 'outline' || props.category === 'building') return;
    if (!props.name) return;

    // Calculate centroid of polygon
    const coords = feature.geometry.coordinates[0];
    let sumLng = 0, sumLat = 0;
    coords.forEach(coord => {
      sumLng += coord[0];
      sumLat += coord[1];
    });
    const centroid = [sumLng / coords.length, sumLat / coords.length];

    // Create marker element
    const el = document.createElement('div');
    el.className = 'store-label';
    el.textContent = props.name;
    el.dataset.level = props.level;
    el.style.cssText = `
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: bold;
      white-space: nowrap;
      pointer-events: none;
      border: 1px solid rgba(255, 255, 255, 0.4);
      box-shadow: 0 2px 6px rgba(0,0,0,0.5);
    `;

    const marker = new maplibregl.Marker({
      element: el,
      anchor: 'bottom'
    })
      .setLngLat(centroid)
      .addTo(map);

    storeMarkers.push({ 
      marker, 
      level: props.level, 
      element: el, 
      centroid,
      height: props.height || 0
    });
  });

  // Update positions initially and on map move
  updateLabelPositions();
  map.on('move', updateLabelPositions);
  map.on('zoom', updateLabelPositions);
  map.on('pitch', updateLabelPositions);
}

function updateLabelPositions() {
  const pitch = map.getPitch();
  const zoom = map.getZoom();
  
  // Scale factor based on zoom (labels move more at higher zoom)
  const zoomScale = Math.pow(2, zoom - 18);
  
  storeMarkers.forEach(({ marker, element, height }) => {
    // Fixed offset: 15 pixels per meter of height, scaled by zoom
    // Ground floor (4m) = 60px, Floor 1 (8m) = 120px, Floor 2 (12m) = 180px
    const baseOffset = height * 15 * zoomScale;
    
    // Pitch adjustment: reduce offset when looking straight down
    const pitchMultiplier = 0.3 + (pitch / 90) * 0.7;
    const totalOffset = baseOffset * pitchMultiplier;
    
    // Apply vertical offset via CSS transform
    element.style.transform = `translateY(${-totalOffset}px)`;
  });
}

function updateLabelVisibility(floor) {
  storeMarkers.forEach(({ marker, level, element }) => {
    if (floor === -1 || level === floor || level === -1) {
      element.style.display = 'block';
    } else {
      element.style.display = 'none';
    }
  });
}

// ===== Update Floor Filter =====
function updateFloorFilter(floor) {
  if (!map.getLayer("room-extrusion")) return;

  if (floor === -1) {
    // Show all floors
    map.setFilter("room-extrusion", null);
  } else {
    // Show selected floor + elevator (level -1)
    const floorFilter = [
      "any",
      ["==", ["get", "level"], floor],
      ["==", ["get", "level"], -1]  // Always show elevator
    ];
    map.setFilter("room-extrusion", floorFilter);
  }

  // Update label visibility
  updateLabelVisibility(floor);

  currentFloor = floor;
}

// ===== Handle Room Click =====
function handleRoomClick(e) {
  if (e.features.length === 0) return;

  const feature = e.features[0];
  const props = feature.properties;

  if (props.category === "building" || props.category === "corridor") return;

  selectedRoom = props;

  elements.roomName.textContent = props.name;
  elements.roomCategory.textContent = props.category;
  elements.roomCategory.style.background =
    CATEGORY_COLORS[props.category] || "#6366F1";
  elements.roomDescription.textContent =
    props.description || "No description available";

  elements.roomInfo.classList.add("show");

  const coordinates = getFeatureCenter(feature);
  map.flyTo({
    center: coordinates,
    zoom: 21,
    pitch: 60,
    duration: 800,
  });
}

// ===== Get Feature Center =====
function getFeatureCenter(feature) {
  const coords = feature.geometry.coordinates[0];
  let sumLng = 0,
    sumLat = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    sumLng += coords[i][0];
    sumLat += coords[i][1];
  }

  return [sumLng / (coords.length - 1), sumLat / (coords.length - 1)];
}

// ===== Populate Navigation Dropdowns =====
function populateNavigationOptions() {
  const locations = floorplanData.features
    .filter(
      (f) =>
        f.properties.category !== "corridor" &&
        f.properties.category !== "building" &&
        !f.properties.isOutline
    )
    .map((f) => ({
      name: f.properties.name,
      level: f.properties.level,
      category: f.properties.category,
    }))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  elements.navFrom.innerHTML = '<option value="">Select starting point...</option>';
  elements.navTo.innerHTML = '<option value="">Select destination...</option>';

  const floorNames = ["Ground Floor", "First Floor", "Second Floor"];

  [0, 1, 2].forEach((level) => {
    const floorLocations = locations.filter((l) => l.level === level);
    if (floorLocations.length > 0) {
      const optGroup = document.createElement("optgroup");
      optGroup.label = floorNames[level];

      floorLocations.forEach((loc) => {
        const option = document.createElement("option");
        option.value = loc.name;
        option.textContent = `${CATEGORY_ICONS[loc.category] || "📍"} ${loc.name}`;
        optGroup.appendChild(option);
      });

      elements.navFrom.appendChild(optGroup.cloneNode(true));
      elements.navTo.appendChild(optGroup);
    }
  });
}

// ===== Find Path Using Navigation Graph =====
function findPath(fromName, toName) {
  if (!navGraph) return null;

  // Find node IDs for the locations
  const fromNode = findNodeByName(fromName);
  const toNode = findNodeByName(toName);

  if (!fromNode || !toNode) return null;

  // BFS to find shortest path
  const queue = [[fromNode]];
  const visited = new Set([fromNode]);

  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];

    if (current === toNode) {
      return path.map((nodeId) => navGraph.nodes[nodeId]);
    }

    // Find connected nodes
    for (const edge of navGraph.edges) {
      let neighbor = null;
      if (edge[0] === current) neighbor = edge[1];
      else if (edge[1] === current) neighbor = edge[0];

      if (neighbor && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }

  return null;
}

// ===== Find Node by Location Name =====
function findNodeByName(name) {
  const nameLower = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  
  for (const [nodeId, node] of Object.entries(navGraph.nodes)) {
    // Existing check
    const nodeIdClean = nodeId.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (nodeIdClean.includes(nameLower) || nameLower.includes(nodeIdClean)) {
      return nodeId;
    }

    // New check: strip prefix (g_, f1_, f2_) to match core name
    // e.g. "g_anandanna" -> "anandanna", matches "Anandanna Shop"
    const nodeIdWithoutPrefix = nodeId.replace(/^[gf]\d?_/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (nodeIdWithoutPrefix.length >= 3 && (nameLower.includes(nodeIdWithoutPrefix) || nodeIdWithoutPrefix.includes(nameLower))) {
       return nodeId;
    }
  }
  
  // Fallback: find by matching feature properties
  const feature = floorplanData.features.find((f) => f.properties.name === name);
  if (feature) {
    const level = feature.properties.level;
    // Return the nearest corridor node on that floor
    if (level === 0) return "g_walkway_center";
    if (level === 1) return "f1_walkway_center";
    if (level === 2) return "f2_walkway_center";
  }
  
  return null;
}

// ===== Calculate Navigation =====
function calculateNavigation() {
  const from = elements.navFrom.value;
  const to = elements.navTo.value;

  if (!from || !to) {
    alert("Please select both start and destination");
    return;
  }

  if (from === to) {
    alert("Start and destination cannot be the same");
    return;
  }

  const fromFeature = floorplanData.features.find((f) => f.properties.name === from);
  const toFeature = floorplanData.features.find((f) => f.properties.name === to);

  if (!fromFeature || !toFeature) {
    alert("Could not find selected locations");
    return;
  }

  const fromLevel = fromFeature.properties.level;
  const toLevel = toFeature.properties.level;

  // Perform Pathfinding
  const pathNodes = findPath(from, to);

  if (!pathNodes) {
    alert("Could not find a path between these locations.");
    return;
  }

  // Convert nodes to coordinates
  const pathCoords = pathNodes.map(node => node.coords);

  // Generate navigation instructions
  let instructions = [];

  instructions.push({
    step: 1,
    text: `Start at ${from} (Floor ${fromLevel === 0 ? "G" : fromLevel})`,
    icon: CATEGORY_ICONS[fromFeature.properties.category] || "📍",
  });

  // Check for floor changes in the path
  let currentPathLevel = fromLevel;
  pathNodes.forEach((node, index) => {
    if (node.floor !== -1 && node.floor !== currentPathLevel) {
       // We changed floors (via elevator probably)
       // Determine direction
       const direction = node.floor > currentPathLevel ? "up" : "down";
       instructions.push({
         step: instructions.length + 1,
         text: `Take Elevator ${direction} to Floor ${node.floor === 0 ? "G" : node.floor}`,
         icon: "🛗",
       });
       currentPathLevel = node.floor;
    }
  });

  instructions.push({
    step: instructions.length + 1,
    text: `Arrive at ${to}`,
    icon: CATEGORY_ICONS[toFeature.properties.category] || "🎯",
  });

  // Calculate estimated time
  const distance = calculateTotalDistance(pathCoords);
  const walkingSpeed = 1.4; // m/s
  const floorChangePenalty = Math.abs(toLevel - fromLevel) * 45;
  const walkingTime = Math.ceil((distance / walkingSpeed) + floorChangePenalty);

  instructions.push({
    step: "time",
    text: `~${Math.ceil(walkingTime / 60)} min (${Math.round(distance)}m)`,
    icon: "⏱️",
  });

  displayNavigationResult(instructions);
  drawAnimatedPath(pathCoords);
  
  // Show path on appropriate floor
  if (fromLevel === toLevel) {
    setFloor(fromLevel);
  } else {
    setFloor(-1); // Show all floors for multi-floor navigation
  }
}

// ===== Generate Path Coordinates (Deprecated, removed) =====
// Function removed in favor of graph-based pathfinding

// ===== Calculate Total Distance =====
function calculateTotalDistance(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += calculateDistance(coords[i - 1], coords[i]) * 1000; // Convert km to m
  }
  return total;
}

// ===== Display Navigation Result =====
function displayNavigationResult(instructions) {
  elements.navResult.innerHTML = instructions
    .map(
      (inst) => `
        <div class="route-step">
            <span class="step-icon">${inst.icon}</span>
            <span>${inst.text}</span>
        </div>
    `
    )
    .join("");

  elements.navResult.classList.add("show");
}

// ===== Draw Animated Navigation Path =====
function drawAnimatedPath(coordinates) {
  // Stop any existing animation
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // Remove existing navigation layers
  clearNavigationPath();

  // Add navigation route source
  map.addSource("nav-route", {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: coordinates,
      },
    },
  });

  // Background line (static) - Raised above floor
  map.addLayer({
    id: "nav-line-bg",
    type: "line",
    source: "nav-route",
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#1E3A5F",
      "line-width": 10,
      "line-opacity": 0.8,
      "line-translate": [0, -10], // Visual lift
      "line-translate-anchor": "viewport"
    },
  });

  // Animated dashed line
  map.addLayer({
    id: "nav-line",
    type: "line",
    source: "nav-route",
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#F97316",
      "line-width": 5,
      "line-dasharray": [0, 2, 2],
      "line-translate": [0, -10], // Visual lift
      "line-translate-anchor": "viewport"
    },
  });

  // Glow effect
  map.addLayer({
    id: "nav-line-glow",
    type: "line",
    source: "nav-route",
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#FBBF24",
      "line-width": 15,
      "line-opacity": 0.4,
      "line-blur": 5,
      "line-translate": [0, -10], // Visual lift
      "line-translate-anchor": "viewport"
    },
  });

  // Add start and end markers
  addNavigationMarkers(coordinates);

  // Start animation
  animatePath();

  // Fit map to show the entire path
  const bounds = coordinates.reduce(
    (bounds, coord) => bounds.extend(coord),
    new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
  );

  map.fitBounds(bounds, {
    padding: { top: 100, bottom: 150, left: 50, right: 350 },
    pitch: 50,
    duration: 1200,
  });
}

// ===== Add Navigation Markers =====
function addNavigationMarkers(coordinates) {
  // Add intermediate markers ( Elevator )
  const elevatorPoints = coordinates.filter((coord, index) => {
    // Simple heuristic: if this point is the elevator location
    // In a real app we would track node types in the path
    const isElevator = 
        Math.abs(coord[0] - 75.0052) < 0.0001 && 
        Math.abs(coord[1] - 12.5022) < 0.0001;
    // Only add if it's not start or end
    return isElevator && index !== 0 && index !== coordinates.length - 1;
  });

  const markers = [
    { type: "start", coords: startCoord },
    { type: "end", coords: endCoord }
  ];

  elevatorPoints.forEach(coord => {
      markers.push({ type: "elevator", coords: coord });
  });

  map.addSource("nav-markers", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: markers.map(m => ({
        type: "Feature",
        properties: { type: m.type },
        geometry: { type: "Point", coordinates: m.coords },
      })),
    },
  });

  map.addLayer({
    id: "nav-markers",
    type: "circle",
    source: "nav-markers",
    paint: {
      "circle-radius": [
          "match", ["get", "type"],
          "elevator", 12,
          10
      ],
      "circle-color": [
        "match",
        ["get", "type"],
        "start", "#22C55E",
        "end", "#EF4444",
        "elevator", "#F59E0B",
        "#F97316",
      ],
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ffffff",
    },
  });

  map.addLayer({
    id: "nav-markers-pulse",
    type: "circle",
    source: "nav-markers",
    paint: {
      "circle-radius": 20,
      "circle-color": [
        "match",
        ["get", "type"],
        "start",
        "#22C55E",
        "end",
        "#EF4444",
        "#F97316",
      ],
      "circle-opacity": 0.3,
    },
  });
}

// ===== Animate Path =====
function animatePath() {
  dashOffset += 0.5;
  
  if (map.getLayer("nav-line")) {
    map.setPaintProperty("nav-line", "line-dasharray", [
      0,
      2 + (dashOffset % 4),
      2,
    ]);
  }

  animationId = requestAnimationFrame(animatePath);
}

// ===== Clear Navigation Path =====
function clearNavigationPath() {
  const layersToRemove = [
    "nav-line",
    "nav-line-bg",
    "nav-line-glow",
    "nav-markers",
    "nav-markers-pulse",
  ];
  const sourcesToRemove = ["nav-route", "nav-markers"];

  layersToRemove.forEach((layer) => {
    if (map.getLayer(layer)) map.removeLayer(layer);
  });

  sourcesToRemove.forEach((source) => {
    if (map.getSource(source)) map.removeSource(source);
  });

  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

// ===== Calculate Distance (Haversine) =====
function calculateDistance(coord1, coord2) {
  const R = 6371;
  const dLat = toRad(coord2[1] - coord1[1]);
  const dLon = toRad(coord2[0] - coord1[0]);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1[1])) *
      Math.cos(toRad(coord2[1])) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// ===== Set Floor =====
function setFloor(floor) {
  elements.floorButtons.forEach((btn) => {
    btn.classList.remove("active");
    if (parseInt(btn.dataset.floor) === floor) {
      btn.classList.add("active");
    }
  });

  updateFloorFilter(floor);
}

// ===== Setup Event Listeners =====
function setupEventListeners() {
  elements.floorButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const floor = parseInt(btn.dataset.floor);
      setFloor(floor);
    });
  });

  elements.navigateBtn.addEventListener("click", calculateNavigation);

  elements.closeNav.addEventListener("click", () => {
    elements.navResult.classList.remove("show");
    clearNavigationPath();
  });

  elements.setStartBtn.addEventListener("click", () => {
    if (selectedRoom) {
      elements.navFrom.value = selectedRoom.name;
      elements.roomInfo.classList.remove("show");
    }
  });

  elements.setDestBtn.addEventListener("click", () => {
    if (selectedRoom) {
      elements.navTo.value = selectedRoom.name;
      elements.roomInfo.classList.remove("show");
      if (elements.navFrom.value) {
        calculateNavigation();
      }
    }
  });

  elements.view3dBtn.addEventListener("click", () => {
    elements.view3dBtn.classList.add("active");
    elements.view2dBtn.classList.remove("active");
    map.easeTo({ pitch: 55, bearing: -15, duration: 800 });
  });

  elements.view2dBtn.addEventListener("click", () => {
    elements.view2dBtn.classList.add("active");
    elements.view3dBtn.classList.remove("active");
    map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
  });

  document.addEventListener("click", (e) => {
    if (
      !elements.roomInfo.contains(e.target) &&
      !e.target.closest(".maplibregl-canvas")
    ) {
      elements.roomInfo.classList.remove("show");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      elements.roomInfo.classList.remove("show");
      elements.navResult.classList.remove("show");
      clearNavigationPath();
    }
    if (e.key === "0" || e.key === "g" || e.key === "G") setFloor(0);
    if (e.key === "1") setFloor(1);
    if (e.key === "2") setFloor(2);
  });
}

// ===== Hide Loading Overlay =====
function hideLoading() {
  setTimeout(() => {
    elements.loading.classList.add("hidden");
  }, 500);
}

// ===== Initialize on DOM Ready =====
document.addEventListener("DOMContentLoaded", init);
