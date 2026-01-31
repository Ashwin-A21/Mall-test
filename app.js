/**
 * Aitsun blueprint - 3D Indoor Map Application
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
    // Load both floorplan and wall data
    const [floorplanRes, wallRes] = await Promise.all([
      fetch("mall-floorplan.geojson"),
      fetch("wall_data.geojson")
    ]);
    
    const floorplanJson = await floorplanRes.json();
    const wallJson = await wallRes.json();
    
    // Process wall data and merge into floorplan
    const processedWalls = wallJson.features.map(feature => ({
      ...feature,
      properties: {
        ...(feature.properties || {}),
        category: "wall",
        level: -1, 
        height: (feature.properties && feature.properties.name === "wall_extrude") ? 4 : 0.5,
        base_height: 0,
        color: (feature.properties && feature.properties.color) || "#94A3B8", 
        description: "Building structure"
      }
    }));

    floorplanData = { 
      type: "FeatureCollection", 
      features: [...floorplanJson.features, ...processedWalls] 
    };
    navGraph = floorplanJson.navGraph;
    
    initMap();
    populateNavigationOptions();
    setupEventListeners();
  } catch (error) {
    console.error("Failed to initialize:", error);
    alert("Failed to load map data. Please refresh the page.");
  }
}

// ===== Initialize MapLibre Map =====
function initMap() {
  map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      name: "Aitsun blue print",
      sources: {
        "carto-dark": {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
            "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
            "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
          ],
          tileSize: 256,
          attribution: '&copy; OSM, &copy; CARTO'
        },
      },
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "#050a10" }, // Dark background (matches theme)
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
// if (feature.properties.category === "building") return; // Allow hover on building/wall features
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
  // Assign IDs for feature state
  floorplanData.features = floorplanData.features.map((feature, index) => {
    // Ensure properties exists
    if (!feature.properties) feature.properties = {};
    
    // Assign defaults for missing properties to prevent MapLibre errors
    feature.properties.id = index;
    if (feature.properties.color == null) feature.properties.color = "#cccccc";
    
    // Ensure numbers are actual numbers (not strings)
    feature.properties.height = (feature.properties.height == null) ? 3 : Number(feature.properties.height);
    if (isNaN(feature.properties.height)) feature.properties.height = 3;
    
    feature.properties.base_height = (feature.properties.base_height == null) ? 0 : Number(feature.properties.base_height);
    if (isNaN(feature.properties.base_height)) feature.properties.base_height = 0;
    
    feature.properties.level = (feature.properties.level == null) ? 0 : Number(feature.properties.level);
    if (isNaN(feature.properties.level)) feature.properties.level = 0;

    if (feature.properties.category == null) feature.properties.category = "common";
    if (feature.properties.isOutline == null) feature.properties.isOutline = false;

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
      "line-color": "#60A5FA", // Light blue for dark map
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
      "fill-extrusion-color": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        "#fbbf24",
        ["coalesce", ["get", "color"], "#cccccc"]
      ],
      "fill-extrusion-height": ["coalesce", ["get", "height"], 0],
      "fill-extrusion-base": ["coalesce", ["get", "base_height"], 0],
      "fill-extrusion-opacity": 0.8,
    },
  });

  // Create 3D labels using HTML markers with altitude-aware offsets
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
    if (props.isOutline || props.category === 'outline' || props.category === 'building' || props.category === 'wall') return;
    if (!props.name || props.name === 'object' || props.name === 'wall_extrude') return;

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

    // Initialize marker without offset first
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
      height: props.height || 0,
      base_height: props.base_height || 0,
      id: feature.id
    });
  });

  // Update positions initially and on map move
  updateLabelPositions();
  map.on('move', updateLabelPositions);
  map.on('zoom', updateLabelPositions);
  map.on('pitch', updateLabelPositions);
}

// ===== Helper: Calculate 3D Altitude in Pixels =====
function calculatePixelAltitude(height, zoom, pitch) {
  // Formula: height * pxPerMeter * pitchFactor
  // pxPerMeter = 1.7 * 2^(zoom - 18)
  const zoomScale = Math.pow(2, zoom - 18);
  const pxPerMeter = 1.7 * zoomScale;
  const pitchFactor = Math.cos(pitch * Math.PI / 180);
  
  return height * pxPerMeter * pitchFactor;
}

// ===== Update Label Positions (3D Altitude Logic) =====
function updateLabelPositions() {
  const zoom = map.getZoom();
  const pitch = map.getPitch();
  
  // Combine both marker sets
  const allMarkers = [...storeMarkers, ...navigationMarkers];

  allMarkers.forEach(({ marker, height, base_height }) => {
    // Total height of the roof relative to ground
    const totalHeight = (base_height || 0) + (height || 0);
    const pixelLift = calculatePixelAltitude(totalHeight, zoom, pitch);
    
    // Safety check
    if (!isNaN(pixelLift)) {
         marker.setOffset([0, -pixelLift]);
    }
  });
}

// (Original updateLabelPositions and updateLabelVisibility removed - using updated versions at end of file)

// ===== Update Floor Filter (Original Removed) =====

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
        f.properties.category !== "wall" &&
        !f.properties.isOutline &&
        f.properties.name && 
        f.properties.name !== "object" &&
        f.properties.name !== "wall_extrude"
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
  drawAnimatedPath(pathCoords, pathNodes);
  
  // Show path on appropriate floors
  // Strategy: ALWAYS show the FROM floor layout, plus the TO Room
  
  const fromId = fromFeature.id;
  const toId = toFeature.id;
  
  // We want to see the layout of the start floor.
  // And we want to see the destination room regardless of floor.
  // AND the start room (which is on start floor anyway).
  
  // Ensure elevator is hidden during navigation
  updateFloorFilter([fromLevel], [toId, fromId], true);

  // Highlight Start and End Rooms
  highlightFeature(fromFeature.id, true);
  highlightFeature(toFeature.id, true);
  
  // Manually ensure the destination label is visible
  // We need to look up marker for toId.
  // Since we don't have direct ID map, matching by centroid or loop
  // Simple fix: Force show all markers on involved floors or just dest
  // For now, let's update storeMarkers to allow finding by ID if we add it or just loop
}

// ===== Calculate Total Distance =====
function calculateTotalDistance(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += calculateDistance(coords[i - 1], coords[i]) * 1000; // Convert km to m
  }
  return total;
}

// ===== Calculate Distance (Haversine) =====
function calculateDistance(coord1, coord2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(coord2[1] - coord1[1]);
  const dLon = deg2rad(coord2[0] - coord1[0]);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(coord1[1])) *
      Math.cos(deg2rad(coord2[1])) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// ===== Highlight Feature =====
function highlightFeature(id, isActive) {
    if (id === undefined || id === null) return;
    map.setFeatureState(
        { source: "floorplan", id: id },
        { highlight: isActive }
    );
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
// (Removed duplicate drawAnimatedPath)
  
// ===== Add Navigation Markers =====
let navigationMarkers = [];

function addNavigationMarkers(coordinates, pathNodes) {
  const startNode = pathNodes[0];
  const endNode = pathNodes[pathNodes.length - 1];

  // Identify elevator points (where floor changes)
  const elevatorNodes = [];
  for(let i=1; i<pathNodes.length; i++) {
      if (pathNodes[i].floor !== pathNodes[i-1].floor) {
          // Add the node before the change (or after, just one per transition)
          elevatorNodes.push(pathNodes[i-1]); 
      }
  }

  const markersToCreate = [
    { type: "start", node: startNode, color: "#22C55E", label: "Start" },
    { type: "end", node: endNode, color: "#EF4444", label: "End" }
  ];

  elevatorNodes.forEach(node => {
      markersToCreate.push({ type: "elevator", node: node, color: "#F59E0B", label: "Elevator" });
  });

  markersToCreate.forEach(m => {
      const el = document.createElement('div');
      el.className = 'nav-marker-dot';
      el.style.cssText = `
        width: 20px;
        height: 20px;
        background: ${m.color};
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 0 10px ${m.color};
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 5;
      `;
      
      const inner = document.createElement('div');
      inner.style.cssText = "width: 6px; height: 6px; background: white; border-radius: 50%;";
      el.appendChild(inner);

      const level = m.node.floor === -1 ? 0 : m.node.floor; 
      const baseHeight = level * 4; 

      const marker = new maplibregl.Marker({
          element: el,
          anchor: 'bottom'
      })
      .setLngLat(m.node.coords)
      .addTo(map);

      navigationMarkers.push({
          marker,
          element: el,
          level: level,
          height: 0,
          base_height: baseHeight // Store base height
      });
  });
  
  updateLabelPositions();
}

// ===== Generate Path Buffer (For 3D Line Validation) =====
function createPathBuffer(coords, widthMeters) {
    if (coords.length < 2) return null;
    
    // Approx degrees offsets
    const centerLat = coords[0][1];
    const metersPerDegLat = 111132;
    const metersPerDegLng = 111132 * Math.cos(centerLat * Math.PI / 180);
    
    // Scale width
    const offsetLat = (widthMeters / 2) / metersPerDegLat;
    const offsetLng = (widthMeters / 2) / metersPerDegLng;

    const polygons = [];
    
    for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i+1];
        
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len === 0) continue;
        
        // Normal vector (-dy, dx) normalized
        const nx = -dy / len;
        const ny = dx / len;
        
        // Offset vector
        const offX = nx * offsetLng;
        const offY = ny * offsetLat;
        
        // Create Rectangle for this segment
        const p1L = [p1[0] + offX, p1[1] + offY];
        const p1R = [p1[0] - offX, p1[1] - offY];
        const p2L = [p2[0] + offX, p2[1] + offY];
        const p2R = [p2[0] - offX, p2[1] - offY];
        
        polygons.push([p1L, p2L, p2R, p1R, p1L]);
        
        // Add a joint square at p2 to fill cracks between segments
        // (Not needed for last point, but harmless if added)
        // We use a simple box around the point
        if (i < coords.length - 1) {
            polygons.push([
                [p2[0] - offsetLng, p2[1] - offsetLat],
                [p2[0] + offsetLng, p2[1] - offsetLat],
                [p2[0] + offsetLng, p2[1] + offsetLat],
                [p2[0] - offsetLng, p2[1] + offsetLat],
                [p2[0] - offsetLng, p2[1] - offsetLat]
            ]);
        }
        
        // Also add joint at p1 for the very first point to be safe or if it connects weirdly
        if (i === 0) {
             polygons.push([
                [p1[0] - offsetLng, p1[1] - offsetLat],
                [p1[0] + offsetLng, p1[1] - offsetLat],
                [p1[0] + offsetLng, p1[1] + offsetLat],
                [p1[0] - offsetLng, p1[1] + offsetLat],
                [p1[0] - offsetLng, p1[1] - offsetLat]
            ]);
        }
    }
    
    return {
        type: "Feature",
        geometry: {
            type: "MultiPolygon",
            coordinates: polygons
        }
    };
}

// ===== Generate Square Buffer (For Vertical Shaft) =====
function createSquareBuffer(center, sizeMeters) {
    const centerLat = center[1];
    const metersPerDegLat = 111132;
    const metersPerDegLng = 111132 * Math.cos(centerLat * Math.PI / 180);
    
    const halfSizeLat = (sizeMeters / 2) / metersPerDegLat;
    const halfSizeLng = (sizeMeters / 2) / metersPerDegLng;
    
    const c0 = center[0];
    const c1 = center[1];
    
    const ring = [
        [c0 - halfSizeLng, c1 - halfSizeLat],
        [c0 + halfSizeLng, c1 - halfSizeLat],
        [c0 + halfSizeLng, c1 + halfSizeLat],
        [c0 - halfSizeLng, c1 + halfSizeLat],
        [c0 - halfSizeLng, c1 - halfSizeLat]
    ];
    
    return {
        type: "Feature",
        geometry: {
            type: "Polygon",
            coordinates: [ring]
        },
        properties: {}
    };
}

// ===== Draw Animated Navigation Path =====
let navMarker = null;

function drawAnimatedPath(coordinates, pathNodes) {
  // Stop existing animation
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  
  clearNavigationPath();
  if (navMarker) {
      navMarker.remove();
      navMarker = null;
  }
  
  // Hide solid elevator so wireframe is visible
  const activeBtn = document.querySelector(".floor-btn.active");
  const currentFloor = activeBtn ? parseInt(activeBtn.dataset.floor) : 0;
  updateFloorFilter(currentFloor, [], true); // Keep filter override
  
  // Force Hide solid elevator using paint property (Removed: Not supported in MapLibre)
  // Logic is now handled by updateFloorFilter(..., ..., true) below


  // 1. Split path into segments per floor & Detect Vertical Transitions
  const segments = { 0: [], 1: [], 2: [] };
  const verticalTransitions = []; 
  
  let lastTrackedFloor = -1;
  let potentialElevatorCoords = null;

  pathNodes.forEach((node, i) => {
      const floor = node.floor;
      
      // Tracking for Vertical Transitions
      if (floor === -1) {
          potentialElevatorCoords = node.coords;
      } else {
          if (lastTrackedFloor !== -1 && floor !== lastTrackedFloor) {
               const shaftCoords = potentialElevatorCoords || node.coords;
               verticalTransitions.push({
                   coords: shaftCoords,
                   from: lastTrackedFloor,
                   to: floor
               });
               potentialElevatorCoords = null;
          }
          lastTrackedFloor = floor;
      }

      if (floor === undefined || floor === -1) {
          let effectiveFloor = lastTrackedFloor;
          if (effectiveFloor !== -1) {
              if (!segments[effectiveFloor]) segments[effectiveFloor] = [];
              segments[effectiveFloor].push(node.coords);
          }
      } else {
          if (!segments[floor]) segments[floor] = [];
          segments[floor].push(node.coords);
      }
  });

  // 2. Create Horizontal Layers (Per Floor)
  Object.keys(segments).forEach(floorStr => {
      const floor = parseInt(floorStr);
      const coords = segments[floor];
      if (coords.length < 2) return;
      
      // Use existing createPathBuffer helper
      const polyFeature = createPathBuffer(coords, 0.8); 
      if (!polyFeature) return;

      const layerId = `nav-route-${floor}`;
      map.addSource(layerId, {
          type: "geojson",
          data: polyFeature
      });
      
      const baseHeight = floor * 4;
      
      // 3D Floating Path (3m offset for high visibility)
      map.addLayer({
          id: `${layerId}-3d`,
          type: "fill-extrusion",
          source: layerId,
          paint: {
              "fill-extrusion-color": "#3B82F6", 
              "fill-extrusion-height": baseHeight + 3.0, 
              "fill-extrusion-base": baseHeight + 2.8,  
              "fill-extrusion-opacity": 0.95
          }
      });
  });
  
  // 3. Create Vertical Layers (Elevator Shafts - Wireframe/Pillars)
  if (verticalTransitions.length > 0) {
      const features = verticalTransitions.map(trans => {
          // Create 4 corner pillars with thinner profile for distinct wireframe look
          const feature = createCornerPillars(trans.coords, 1.6, 0.08); 
          const minF = Math.min(trans.from, trans.to);
          const maxF = Math.max(trans.from, trans.to);
          
          feature.properties = {
              base: minF * 4,
              top: maxF * 4 + 3.0 
          };
          return feature;
      });
      
      map.addSource("nav-vertical", {
          type: "geojson",
          data: { type: "FeatureCollection", features: features }
      });
      
      map.addLayer({
          id: "nav-vertical-extrusion",
          type: "fill-extrusion",
          source: "nav-vertical",
          paint: {
              "fill-extrusion-color": "#64748B", // Structural Gray
              "fill-extrusion-height": ["get", "top"],
              "fill-extrusion-base": ["get", "base"],
              "fill-extrusion-opacity": 0.8 
          }
      });
  }

  // Add 3D Avatar (Composite Humanoid)
  // 1. Body Source & Layer
  map.addSource("nav-avatar-body", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
  });
  map.addLayer({
      id: "nav-avatar-body-3d",
      type: "fill-extrusion",
      source: "nav-avatar-body",
      paint: {
          "fill-extrusion-color": "#2563EB", // Blue shirt
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "base"],
          "fill-extrusion-opacity": 1.0
      }
  });

  // 2. Head Source & Layer
  map.addSource("nav-avatar-head", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
  });
  map.addLayer({
      id: "nav-avatar-head-3d",
      type: "fill-extrusion",
      source: "nav-avatar-head",
      paint: {
          "fill-extrusion-color": "#FEF3C7", // Skin tone
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "base"],
          "fill-extrusion-opacity": 1.0
      }
  });

  addNavigationMarkers(coordinates, pathNodes);

  // Animation Loop with Vertical Distance
  let startTime = null;
  const totalDist = calculateTotalDistanceWithElevators(pathNodes);
  
  function animate(timestamp) {
      if (!startTime) startTime = timestamp;
      let progress = (timestamp - startTime) / 8000; 
      if (progress > 1) { startTime = timestamp; progress = 0; }
      
      const currentDist = progress * totalDist;
      const navPoint = getNavPointAtDistanceWithElevators(pathNodes, currentDist); 
      
      if (navPoint) {
           // Calculate Z levels
           const zFloor = (navPoint.floor * 4) + 3.0; // Feet at path level
           const zNeck = zFloor + 1.2; // 1.2m tall body
           const zHeadTop = zNeck + 0.4; // 0.4m tall head
           
           // Create Body Polygon (Circle, r=0.3m)
           const bodyPoly = createCircleBuffer(navPoint.coords, 0.4);
           bodyPoly.properties = { base: zFloor, height: zNeck };
           
           // Create Head Polygon (Circle, r=0.2m)
           const headPoly = createCircleBuffer(navPoint.coords, 0.25);
           headPoly.properties = { base: zNeck, height: zHeadTop };
           
           map.getSource("nav-avatar-body").setData(bodyPoly);
           map.getSource("nav-avatar-head").setData(headPoly);
      }
      animationId = requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate); 
  
  const bounds = coordinates.reduce(
    (bounds, coord) => bounds.extend(coord),
    new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
  );
  map.fitBounds(bounds, { padding: 100, pitch: 50 });
}

// Helper: Create Circle Polygon (approximate with 16 segments)
function createCircleBuffer(center, radiusMeters) {
    const segments = 16;
    const coords = [];
    const centerLat = center[1];
    const metersPerDegLat = 111132;
    const metersPerDegLng = 111132 * Math.cos(centerLat * Math.PI / 180);
    
    // Convert radius to degrees
    const rLat = radiusMeters / metersPerDegLat;
    const rLng = radiusMeters / metersPerDegLng;
    
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * 2 * Math.PI;
        const dx = rLng * Math.cos(theta);
        const dy = rLat * Math.sin(theta);
        coords.push([center[0] + dx, center[1] + dy]);
    }
    
    return {
        type: "Feature",
        geometry: {
            type: "Polygon",
            coordinates: [coords]
        },
        properties: {}
    };
}

// Helper: Create 4 Corner Pillars for Wireframe Elevator
function createCornerPillars(center, shaftWidth, pillarWidth) {
    const halfShaft = shaftWidth / 2;
    const halfPillar = pillarWidth / 2;
    
    // Conversion factors
    const centerLat = center[1];
    const metersPerDegLat = 111132;
    const metersPerDegLng = 111132 * Math.cos(centerLat * Math.PI / 180);
    
    // Function to create one pillar polygon
    const createPillar = (cx, cy) => {
        const offX = halfPillar / metersPerDegLng;
        const offY = halfPillar / metersPerDegLat;
        return [
            [cx - offX, cy - offY],
            [cx + offX, cy - offY],
            [cx + offX, cy + offY],
            [cx - offX, cy + offY],
            [cx - offX, cy - offY]
        ];
    };
    
    const polygons = [];
    
    // Corner 1: Top Right
    {
        const cx = center[0] + (halfShaft / metersPerDegLng);
        const cy = center[1] + (halfShaft / metersPerDegLat);
        polygons.push(createPillar(cx, cy));
    }
    // Corner 2: Bottom Right
    {
        const cx = center[0] + (halfShaft / metersPerDegLng);
        const cy = center[1] - (halfShaft / metersPerDegLat);
        polygons.push(createPillar(cx, cy));
    }
    // Corner 3: Bottom Left
    {
        const cx = center[0] - (halfShaft / metersPerDegLng);
        const cy = center[1] - (halfShaft / metersPerDegLat);
        polygons.push(createPillar(cx, cy));
    }
    // Corner 4: Top Left
    {
        const cx = center[0] - (halfShaft / metersPerDegLng);
        const cy = center[1] + (halfShaft / metersPerDegLat);
        polygons.push(createPillar(cx, cy));
    }
    
    return {
        type: "Feature",
        geometry: {
            type: "MultiPolygon",
            coordinates: polygons.map(p => [p])
        },
        properties: {}
    };
}

// Helper: Distance calculating vertical steps
function calculateTotalDistanceWithElevators(nodes) {
    let dist = 0;
    for(let i=0; i<nodes.length-1; i++) {
        const floorDiff = Math.abs(nodes[i].floor - nodes[i+1].floor);
        if (floorDiff > 0) {
             dist += floorDiff * 4; // 4 meters
        } else {
             dist += calculateDistance(nodes[i].coords, nodes[i+1].coords) * 1000; 
        }
    }
    return dist;
}

// Helper: Interpolation with Elevators
function getNavPointAtDistanceWithElevators(nodes, dist) {
    let d = 0;
    for (let i = 0; i < nodes.length - 1; i++) {
        let segD = 0;
        const floorDiff = nodes[i+1].floor - nodes[i].floor; // signed
        
        if (Math.abs(floorDiff) > 0) {
            segD = Math.abs(floorDiff) * 4; // 4 meters per floor
        } else {
            segD = calculateDistance(nodes[i].coords, nodes[i+1].coords) * 1000;
        }

        if (d + segD >= dist) {
            const r = (dist - d) / segD; // 0..1 progress in segment
            
            // Coord interpolation
            const coords = [
                nodes[i].coords[0] + (nodes[i+1].coords[0] - nodes[i].coords[0]) * r,
                nodes[i].coords[1] + (nodes[i+1].coords[1] - nodes[i].coords[1]) * r
            ];
            
            // Floor interpolation
            const floor = nodes[i].floor + floorDiff * r;
            
            return { coords, floor };
        }
        d += segD;
    }
    return nodes[nodes.length-1];
}

// ===== Update Line Path Altitude =====
function updatePathAltitude() {
    const zoom = map.getZoom();
    const pitch = map.getPitch();
    
    // Heights: G=0, F1=4m, F2=8m
    const lifts = { 0: 0, 1: 4, 2: 8 };
    
    [0, 1, 2].forEach(floor => {
        const height = lifts[floor];
        // Use unified helper for pixel offset (negative to lift up in 2D map space? No, translate Y negative is UP on screen)
        // Wait, MapLibre line-translate is in pixels. Positive Y is down.
        // User formula provided standard "lift" pixel count (positive).
        // So we need negative offset.
        const offset = -calculatePixelAltitude(height, zoom, pitch);
        
        const layerId = `nav-route-${floor}`;
        
        if (!isNaN(offset)) {
            if (map.getLayer(`${layerId}-bg`)) {
                map.setPaintProperty(`${layerId}-bg`, 'line-translate', [0, offset]);
                map.setPaintProperty(`${layerId}-line`, 'line-translate', [0, offset]);
            }
        }
    });
}

// ===== Get Navigation Point at Distance (Interpolation) =====
function getNavPointAtDistance(nodes, dist) {
    let d = 0;
    for (let i = 0; i < nodes.length - 1; i++) {
        const segD = calculateDistance(nodes[i].coords, nodes[i+1].coords) * 1000;
        if (d + segD >= dist) {
            const r = (dist - d) / segD;
            return {
                coords: [
                    nodes[i].coords[0] + (nodes[i+1].coords[0] - nodes[i].coords[0]) * r,
                    nodes[i].coords[1] + (nodes[i+1].coords[1] - nodes[i].coords[1]) * r
                ],
                floor: nodes[i].floor
            };
        }
        d += segD;
    }
    return nodes[nodes.length-1];
}

// ===== Update Floor Filter (Revised) =====
// ===== Update Floor Filter (Revised) =====
function updateFloorFilter(floors, specialIds = [], hideElevator = false) {
  if (!map.getLayer("room-extrusion")) return;

  const activeFloors = Array.isArray(floors) ? floors : [floors];
  const isAll = floors === -1;

  // Combine markers for filtering
  const allMarkers = [...storeMarkers, ...navigationMarkers];

  if (isAll) {
    map.setFilter("room-extrusion", null);
    allMarkers.forEach((item) => {
        item.element.style.display = ''; 
    });
  } else {
    // Show: 
    // 1. All rooms on activeFloors
    // 2. Elevator (level -1) IF not hidden
    // 3. SPECIAL IDs (Start/Dest rooms) regardless of floor
    
    // Base visibility: Active Floors or Special IDs
    const visibilityGroup = ["any",
        ["in", ["get", "level"], ["literal", activeFloors]]
    ];
    
    // Always include level -1 (Walls, Building Outline) so the structure is visible
    visibilityGroup.push(["==", ["get", "level"], -1]);
    
    // Construct final filter
    finalFilter = [
        "all",
        visibilityGroup
    ];
    
    // Explicitly hide elevator if requested (during navigation)
    if (hideElevator) {
        finalFilter.push(["!=", ["get", "category"], "elevator"]);
        finalFilter.push(["!", ["in", "Elevator", ["get", "name"]]]);
    }
    
    /* 
    if (hideElevator) { ... } // Logic removed: Always hide solid elevator
    */
    
    if (specialIds.length > 0) {
        // If special IDs exist, they must be included via OR (any) with the main logic?
        // Wait, if I use "all" above, and then push to it...
        // Actually, Special IDs just need to be added to visibilityGroup?
        // Yes. If it matches ID, show it.
        // BUT if hideElevator is true, do we hide Elevator even if it is Special?
        // Probably yes.
        visibilityGroup.push(["in", ["id"], ["literal", specialIds]]);
    }
    
    map.setFilter("room-extrusion", finalFilter);
    
    // Update marker visibility
    allMarkers.forEach((item) => {
        let isVisible = false;
        
        // Check active floor
        if (activeFloors.includes(item.level)) isVisible = true;
        
        // Check elevator (level -1)
        if (item.level === -1 && !hideElevator) isVisible = true;
        
        // Check special IDs
        if (item.id && specialIds.includes(item.id)) isVisible = true;
        
        item.element.style.display = isVisible ? '' : 'none';
    });
  }
} // End updateFloorFilter

// ===== Clear Navigation Path =====
// ===== Clear NavigationPath =====
function clearNavigationPath() {
  const layersToRemove = [
    "nav-line", "nav-line-bg", "nav-line-glow", 
    "nav-vertical-extrusion", "nav-avatar-body-3d", "nav-avatar-head-3d"
  ];
  const sourcesToRemove = ["nav-route", "nav-vertical", "nav-avatar-body", "nav-avatar-head"];

  // Clean up per-floor segment layers and sources
  [0, 1, 2].forEach(floor => {
      layersToRemove.push(`nav-route-${floor}-3d`);
      layersToRemove.push(`nav-route-${floor}-line-visible`);
      sourcesToRemove.push(`nav-route-${floor}-line-source`);
      sourcesToRemove.push(`nav-route-${floor}`);
  });

  layersToRemove.forEach((layer) => {
    if (map.getLayer(layer)) map.removeLayer(layer);
  });

  sourcesToRemove.forEach((source) => {
    if (map.getSource(source)) map.removeSource(source);
  });
  
  // Remove HTML markers
  if (navigationMarkers) {
      navigationMarkers.forEach(m => m.marker.remove());
      navigationMarkers = [];
  }
  
  // Remove avatar
  if (navMarker) {
      navMarker.remove();
      navMarker = null;
  }

  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  
  // Restore solid elevator
  const activeBtn = document.querySelector(".floor-btn.active");
  const currentFloor = activeBtn ? parseInt(activeBtn.dataset.floor) : 0;
  updateFloorFilter(currentFloor, [], false);
  
  // Restore opacity (Removed)
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