const fs = require('fs');
const path = 'building_refrenced_data.geojson';

try {
  const rawData = fs.readFileSync(path, 'utf8');
  const geojson = JSON.parse(rawData);

  geojson.features = geojson.features.map((feature, index) => {
    const name = (feature.properties.name || "").toLowerCase();
    
    // Default values
    let category = "common";
    let height = 1;
    let base_height = 0;
    let color = "#475569";
    let description = "Unidentified Structure";

    // Logic matching app.js
    if (name.includes("wall")) {
      category = "wall";
      height = 6;
      color = "#334155";
      description = "Reinforced Perimeter";
      if (name.includes("fake")) {
         description = "Concealed Passage";
         color = "#475569";
      }
    } 
    else if (name.includes("security") || name.includes("watchman")) {
      category = "security";
      height = name.includes("dog") ? 0.8 : 1.8;
      color = "#1e3a8a"; 
      description = name.includes("dog") ? "K9 Unit" : "Security Personnel";
    }
    else if (name.includes("employee") || name.includes("staff")) {
      category = "staff";
      height = 1.75;
      color = "#f59e0b";
      description = "Authorized Personnel";
    }
    else if (name.includes("chair")) {
      category = "furniture";
      height = 0.8;
      color = "#78350f";
      description = "Seating";
    }
    else if (name.includes("desk") || name.includes("table") || name.includes("helpdesk")) {
      category = "furniture";
      height = 1.1;
      color = "#a16207";
      description = "Workstation";
    }
    else if (name.includes("camera")) {
      category = "surveillance";
      height = 0.5; 
      base_height = 3.5;
      color = "#ef4444";
      description = "Surveillance Node";
    }
    else if (name.includes("target") || name.includes("locker")) {
      category = "objective";
      height = 1.5;
      color = "#10b981";
      description = "Mission Objective";
    }
    else if (name.includes("door")) {
      category = "entrance";
      height = 2.2;
      color = "#000000";
      description = "Access Point";
    }
    else if (name.includes("label")) {
      category = "label";
      height = 0;
      color = "transparent";
      description = "Signage";
    }

    // Preserve existing properties but overwrite tactical visual ones
    feature.properties = {
      ...feature.properties,
      height,
      base_height,
      color,
      category,
      description
    };
    
    return feature;
  });

  fs.writeFileSync(path, JSON.stringify(geojson, null, 2));
  console.log("Successfully updated building_refrenced_data.geojson with tactical properties.");

} catch (error) {
  console.error("Error processing GeoJSON:", error);
}
