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

    updateSpatialContext(bot, scanData = null) {
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

        // Incorporate rich scan data if available
        if (scanData) {
            this.spatialContext = {
                ...this.spatialContext,
                environmentScan: scanData.scan,
                environmentSummary: scanData.summary,
                accessibleResources: scanData.nearbyResources || [],
                terrain: scanData.terrain || {},
                sightlines: scanData.sightlines || {},
                // Add analysis of the environment
                analysis: {
                    nearestResources: this.analyzeNearestResources(scanData.nearbyResources),
                    clearPaths: this.analyzeClearPaths(scanData.sightlines),
                    terrainDifficulty: this.analyzeTerrainDifficulty(scanData.terrain)
                }
            };
        }
        
        this.lastUpdate = Date.now();
        return this.spatialContext;
    }

    analyzeNearestResources(resources = []) {
        if (!Array.isArray(resources)) return [];
        
        return resources
            .filter(r => r && r.nearest <= 32) // Only consider resources within reasonable range
            .sort((a, b) => a.nearest - b.nearest)
            .map(r => ({
                name: r.name,
                distance: r.nearest,
                quantity: r.count,
                accessible: true
            }));
    }

    analyzeClearPaths(sightlines = {}) {
        if (!sightlines || !sightlines.clearPaths) return [];
        
        return sightlines.clearPaths.map(path => ({
            direction: path.direction,
            distance: path.distance,
            hasObstacles: !path.clear
        }));
    }

    analyzeTerrainDifficulty(terrain = {}) {
        if (!terrain || !terrain.elevation) return 'unknown';
        
        const elevations = Object.values(terrain.elevation);
        if (elevations.length === 0) return 'unknown';
        
        const maxDiff = Math.max(...elevations) - Math.min(...elevations);
        
        if (maxDiff <= 2) return 'easy';
        if (maxDiff <= 5) return 'moderate';
        return 'difficult';
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
            return {
                position: null,
                biome: null,
                nearbyBlocks: [],
                visibleLandmarks: [],
                contextAge: 'No context available'
            };
        }

        const timeSinceUpdate = (Date.now() - this.lastUpdate) / 1000;
        const pos = this.spatialContext.position;
        
        return {
            position: pos ? `(${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)})` : null,
            biome: this.spatialContext.biome || null,
            nearbyBlocks: Array.isArray(this.spatialContext.nearbyBlocks) ? 
                this.spatialContext.nearbyBlocks.slice(0, 5) : [], // Top 5 most common
            visibleLandmarks: Array.isArray(this.spatialContext.visibleLandmarks) ? 
                this.spatialContext.visibleLandmarks.slice(0, 3) : [], // 3 closest landmarks
            contextAge: `${Math.floor(timeSinceUpdate)}s ago`
        };
    }
}