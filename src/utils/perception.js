import { Vec3 } from 'vec3';

export class EnvironmentScanner {
    constructor(bot) {
        this.bot = bot;
        this.lastScan = null;
        this.scanRadius = 32;
        this.heightRange = 10; // Blocks up/down to scan
    }

    // Perform a detailed scan of surroundings
    scan() {
        const pos = this.bot.entity.position;
        const environment = {
            position: pos,
            timestamp: Date.now(),
            blocks: {},
            terrain: this.analyzeTerrain(),
            biome: this.bot.world.getBiome(pos),
            nearbyEntities: this.getNearbyEntities(),
            sightlines: this.analyzeSightlines(),
            obstacles: []
        };

        // Scan in expanding circles for better spatial understanding
        for (let r = 1; r <= this.scanRadius; r += 2) {
            this.scanCircle(pos, r, environment);
        }

        this.lastScan = environment;
        return environment;
    }

    // Scan in a circle at a given radius
    scanCircle(center, radius, environment) {
        const steps = Math.max(8, Math.floor(radius * 2 * Math.PI));
        const angleStep = (2 * Math.PI) / steps;

        for (let i = 0; i < steps; i++) {
            const angle = i * angleStep;
            const x = Math.round(center.x + radius * Math.cos(angle));
            const z = Math.round(center.z + radius * Math.sin(angle));

            // Scan vertical column
            for (let y = center.y - this.heightRange; y <= center.y + this.heightRange; y++) {
                const block = this.bot.blockAt(new Vec3(x, y, z));
                if (!block || block.name === 'air') continue;

                if (!environment.blocks[block.name]) {
                    environment.blocks[block.name] = [];
                }
                environment.blocks[block.name].push({
                    position: block.position,
                    distance: this.getDistance(center, block.position),
                    accessible: this.isAccessible(block)
                });
            }
        }
    }

    // Analyze terrain features
    analyzeTerrain() {
        const pos = this.bot.entity.position;
        const terrain = {
            elevation: {},
            waterBodies: [],
            clearings: [],
            obstacles: []
        };

        // Sample elevation in a grid
        for (let x = -this.scanRadius; x <= this.scanRadius; x += 4) {
            for (let z = -this.scanRadius; z <= this.scanRadius; z += 4) {
                const surfaceY = this.findSurface(pos.x + x, pos.z + z);
                if (surfaceY !== null) {
                    const key = `${x},${z}`;
                    terrain.elevation[key] = surfaceY;
                }
            }
        }

        return terrain;
    }

    // Find the surface level at a given x,z coordinate
    findSurface(x, z) {
        const startY = Math.floor(this.bot.entity.position.y) + this.heightRange;
        
        for (let y = startY; y >= startY - this.heightRange * 2; y--) {
            const block = this.bot.blockAt(new Vec3(x, y, z));
            const blockBelow = this.bot.blockAt(new Vec3(x, y - 1, z));
            
            if (!block || !blockBelow) continue;
            
            if (block.name === 'air' && blockBelow.name !== 'air') {
                return y - 1;
            }
        }
        return null;
    }

    // Analyze what's visible from current position
    analyzeSightlines() {
        const pos = this.bot.entity.position;
        const sightlines = {
            clearPaths: [],
            obstacles: [],
            visibilityMap: {}
        };

        // Check visibility in 8 main directions
        const directions = [
            [1, 0], [1, 1], [0, 1], [-1, 1],
            [-1, 0], [-1, -1], [0, -1], [1, -1]
        ];

        for (const [dx, dz] of directions) {
            const sightline = this.checkSightline(pos, dx, dz);
            const key = `${dx},${dz}`;
            sightlines.visibilityMap[key] = sightline;
            
            if (sightline.clear) {
                sightlines.clearPaths.push(sightline);
            } else {
                sightlines.obstacles.push(sightline.obstacle);
            }
        }

        return sightlines;
    }

    // Check visibility in a direction
    checkSightline(start, dx, dz) {
        const maxDist = 16;
        const sightline = {
            direction: [dx, dz],
            clear: true,
            distance: maxDist,
            obstacle: null
        };

        for (let dist = 1; dist <= maxDist; dist++) {
            const x = Math.floor(start.x + dx * dist);
            const z = Math.floor(start.z + dz * dist);
            
            // Check column for obstacles
            for (let y = start.y - 1; y <= start.y + 2; y++) {
                const block = this.bot.blockAt(new Vec3(x, y, z));
                if (!block) continue;
                
                if (block.name !== 'air' && block.name !== 'cave_air') {
                    sightline.clear = false;
                    sightline.distance = dist;
                    sightline.obstacle = {
                        block: block,
                        position: block.position,
                        distance: dist
                    };
                    return sightline;
                }
            }
        }

        return sightline;
    }

    // Get nearby entities with additional context
    getNearbyEntities() {
        const entities = [];
        const pos = this.bot.entity.position;

        for (const entity of Object.values(this.bot.entities)) {
            const distance = entity.position.distanceTo(pos);
            if (distance > this.scanRadius) continue;

            entities.push({
                type: entity.type,
                name: entity.name,
                position: entity.position,
                distance: distance,
                inSight: this.bot.entityAtCursor(this.scanRadius)?.id === entity.id
            });
        }

        return entities;
    }

    // Check if a block is accessible (can be reached and broken)
    isAccessible(block) {
        if (!block) return false;

        // Check if there's space to stand
        const standingPos = block.position.offset(0, 1, 0);
        const headPos = block.position.offset(0, 2, 0);
        const standingBlock = this.bot.blockAt(standingPos);
        const headBlock = this.bot.blockAt(headPos);

        if (!standingBlock || !headBlock) return false;

        const canStand = standingBlock.name === 'air' && headBlock.name === 'air';
        if (!canStand) return false;

        // Check if block can be broken
        return block.canHarvest(this.bot.heldItem);
    }

    // Calculate distance between two points
    getDistance(pos1, pos2) {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // Get a summary of the environment
    getSummary() {
        if (!this.lastScan) return null;

        const summary = {
            timestamp: this.lastScan.timestamp,
            position: this.lastScan.position,
            nearbyBlocks: [],
            accessibleResources: [],
            terrain: {
                elevation: 'flat', // or 'hilly', 'mountainous'
                obstacles: this.lastScan.obstacles.length,
                clearPaths: this.lastScan.sightlines.clearPaths.length
            },
            entities: this.lastScan.nearbyEntities.length
        };

        // Analyze blocks
        for (const [blockName, instances] of Object.entries(this.lastScan.blocks)) {
            const accessible = instances.filter(b => b.accessible);
            if (accessible.length > 0) {
                summary.accessibleResources.push({
                    name: blockName,
                    count: accessible.length,
                    nearest: Math.min(...accessible.map(b => b.distance))
                });
            }
            summary.nearbyBlocks.push({
                name: blockName,
                count: instances.length,
                nearest: Math.min(...instances.map(b => b.distance))
            });
        }

        // Sort by distance
        summary.accessibleResources.sort((a, b) => a.nearest - b.nearest);
        summary.nearbyBlocks.sort((a, b) => a.nearest - b.nearest);

        return summary;
    }
}