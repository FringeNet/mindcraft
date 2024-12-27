import { getPosition, getBiomeName, getNearbyBlockTypes, getNearbyEntityTypes } from './library/world.js';

export class EnhancedMemoryBank {
    constructor() {
        this.locations = {};  // Named locations
        this.regions = {};    // Named regions with boundaries
        this.landmarks = {};  // Notable features with descriptions
        this.paths = {};      // Known paths between locations
        this.spatialContext = {}; // Current spatial context
        this.lastUpdate = null;
    }

    rememberPlace(name, x, y, z, context = {}) {
        this.locations[name] = {
            position: [x, y, z],
            context: {
                biome: context.biome,
                nearbyBlocks: context.nearbyBlocks,
                landmarks: context.landmarks,
                timestamp: Date.now()
            }
        };
    }

    recallPlace(name) {
        return this.locations[name];
    }

    defineRegion(name, bounds, features) {
        this.regions[name] = {
            bounds: bounds, // {min: [x,y,z], max: [x,y,z]}
            features: features,
            subLocations: [],
            timestamp: Date.now()
        };
    }

    rememberPath(from, to, waypoints, obstacles) {
        const pathKey = `${from}->${to}`;
        this.paths[pathKey] = {
            waypoints: waypoints,
            obstacles: obstacles,
            lastUsed: Date.now(),
            useCount: (this.paths[pathKey]?.useCount || 0) + 1
        };
    }

    getKnownPaths() {
        return Object.entries(this.paths).map(([key, path]) => ({
            route: key,
            lastUsed: path.lastUsed,
            useCount: path.useCount
        }));
    }

    updateSpatialContext(bot) {
        const position = getPosition(bot);
        const biome = getBiomeName(bot);
        const nearbyBlocks = getNearbyBlockTypes(bot, 8);
        const nearbyEntities = getNearbyEntityTypes(bot);
        
        this.spatialContext = {
            position,
            biome,
            nearbyBlocks,
            nearbyEntities,
            timestamp: Date.now(),
            visibleLandmarks: this.getVisibleLandmarks(bot)
        };
        
        this.lastUpdate = Date.now();
        return this.spatialContext;
    }

    getVisibleLandmarks(bot) {
        const position = getPosition(bot);
        const visibleLandmarks = [];
        
        // Check each landmark to see if it's within view distance
        for (const [name, landmark] of Object.entries(this.landmarks)) {
            const distance = this.calculateDistance(position, landmark.position);
            if (distance <= 16) { // Visible range
                visibleLandmarks.push({
                    name,
                    distance,
                    ...landmark
                });
            }
        }
        
        return visibleLandmarks.sort((a, b) => a.distance - b.distance);
    }

    calculateDistance(pos1, pos2) {
        const dx = pos1.x - pos2[0];
        const dy = pos1.y - pos2[1];
        const dz = pos1.z - pos2[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    addLandmark(name, position, description, type = 'natural') {
        this.landmarks[name] = {
            position,
            description,
            type,
            discovered: Date.now()
        };
    }

    getNearbyLandmarks(position, radius = 16) {
        return Object.entries(this.landmarks)
            .map(([name, landmark]) => ({
                name,
                distance: this.calculateDistance(position, landmark.position),
                ...landmark
            }))
            .filter(landmark => landmark.distance <= radius)
            .sort((a, b) => a.distance - b.distance);
    }

    getJson() {
        return {
            locations: this.locations,
            regions: this.regions,
            landmarks: this.landmarks,
            paths: this.paths
        };
    }

    loadJson(json) {
        if (json.locations) this.locations = json.locations;
        if (json.regions) this.regions = json.regions;
        if (json.landmarks) this.landmarks = json.landmarks;
        if (json.paths) this.paths = json.paths;
    }

    summarizeContext() {
        if (!this.spatialContext || !this.lastUpdate) {
            return "No spatial context available";
        }

        const timeSinceUpdate = (Date.now() - this.lastUpdate) / 1000;
        const pos = this.spatialContext.position;
        
        return {
            position: `(${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)})`,
            biome: this.spatialContext.biome,
            nearbyBlocks: this.spatialContext.nearbyBlocks.slice(0, 5), // Top 5 most common
            visibleLandmarks: this.spatialContext.visibleLandmarks.slice(0, 3), // 3 closest landmarks
            contextAge: `${Math.floor(timeSinceUpdate)}s ago`
        };
    }
}