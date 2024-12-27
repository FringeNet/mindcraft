import { getPosition, getNearestBlock, isClearPath } from './library/world.js';
import pf from 'mineflayer-pathfinder';

export class EnhancedNavigation {
    constructor(bot, memoryBank) {
        this.bot = bot;
        this.memory = memoryBank;
        this.currentPath = null;
        this.navigationContext = {};
        this.pathHistory = [];
        this.lastPosition = null;
        this.stuckDetection = {
            lastProgress: 0,
            stuckTime: 0,
            stuckThreshold: 5000 // 5 seconds
        };
    }

    async moveToLocation(target, options = {}) {
        const startContext = {
            position: getPosition(this.bot),
            landmarks: this.memory.getVisibleLandmarks(this.bot)
        };

        // Plan path with context
        const path = await this.planPathWithContext(target, options);
        
        // Execute movement with continuous context updates
        return this.executePathWithContext(path, {
            startContext,
            updateInterval: 1000,
            verificationPoints: path.checkpoints,
            ...options
        });
    }

    async planPathWithContext(target, options = {}) {
        const startPos = getPosition(this.bot);
        const path = {
            waypoints: [],
            checkpoints: [],
            obstacles: [],
            contextualMarkers: []
        };

        // Generate path using mineflayer-pathfinder
        const movements = new pf.Movements(this.bot);
        
        // Customize movement based on options
        if (options.canDig !== undefined) movements.canDig = options.canDig;
        if (options.canPlace !== undefined) movements.canPlaceOn = options.canPlace;
        
        // Set the goal
        let goal;
        if (typeof target === 'object' && target.position) {
            goal = new pf.goals.GoalNear(target.position.x, target.position.y, target.position.z, options.range || 1);
        } else {
            goal = new pf.goals.GoalNear(target.x, target.y, target.z, options.range || 1);
        }

        try {
            const pathfinderPath = await this.bot.pathfinder.getPathTo(movements, goal, 100);
            
            if (pathfinderPath.status === 'success') {
                path.waypoints = pathfinderPath.path;
                
                // Add checkpoints every N blocks
                const checkpointInterval = options.checkpointInterval || 5;
                for (let i = 0; i < path.waypoints.length; i += checkpointInterval) {
                    path.checkpoints.push(path.waypoints[i]);
                }
                
                // Identify potential obstacles
                path.obstacles = await this.identifyObstacles(path.waypoints);
                
                // Add contextual markers
                path.contextualMarkers = await this.generateContextualMarkers(startPos, target);
            }
        } catch (error) {
            console.error('Path planning error:', error);
            throw new Error('Failed to plan path: ' + error.message);
        }

        return path;
    }

    async executePathWithContext(path, options) {
        if (!path.waypoints || path.waypoints.length === 0) {
            throw new Error('Invalid path provided');
        }

        this.currentPath = path;
        this.lastPosition = getPosition(this.bot);
        
        // Set up progress monitoring
        const progressMonitor = setInterval(() => {
            this.updateNavigationProgress();
        }, options.updateInterval || 1000);

        try {
            for (const checkpoint of path.checkpoints) {
                if (this.bot.interrupt_code) {
                    throw new Error('Navigation interrupted');
                }

                // Move to checkpoint
                await this.moveToCheckpoint(checkpoint, options);
                
                // Verify position and update context
                await this.verifyAndUpdateContext(checkpoint);
            }

            // Record successful path
            this.recordSuccessfulPath(options.startContext.position, path.waypoints[path.waypoints.length - 1]);
            
            return true;
        } catch (error) {
            console.error('Path execution error:', error);
            this.recordFailedPath(options.startContext.position, path.waypoints[path.waypoints.length - 1], error);
            throw error;
        } finally {
            clearInterval(progressMonitor);
            this.currentPath = null;
        }
    }

    async moveToCheckpoint(checkpoint, options) {
        const goal = new pf.goals.GoalNear(checkpoint.x, checkpoint.y, checkpoint.z, 1);
        const movements = new pf.Movements(this.bot);
        
        if (options.canDig !== undefined) movements.canDig = options.canDig;
        if (options.canPlace !== undefined) movements.canPlaceOn = options.canPlace;

        try {
            await this.bot.pathfinder.goto(goal);
        } catch (error) {
            throw new Error(`Failed to reach checkpoint: ${error.message}`);
        }
    }

    async verifyAndUpdateContext(checkpoint) {
        const currentPos = getPosition(this.bot);
        const distance = this.calculateDistance(currentPos, checkpoint);
        
        if (distance > 2) { // If we're too far from where we should be
            throw new Error('Navigation verification failed: Off course');
        }

        // Update spatial context
        this.memory.updateSpatialContext(this.bot);
        
        return true;
    }

    updateNavigationProgress() {
        if (!this.currentPath || !this.lastPosition) return;

        const currentPos = getPosition(this.bot);
        const progress = this.calculatePathProgress(currentPos);
        
        // Check for stuck detection
        if (Math.abs(progress - this.stuckDetection.lastProgress) < 0.01) {
            this.stuckDetection.stuckTime += 1000;
            if (this.stuckDetection.stuckTime >= this.stuckDetection.stuckThreshold) {
                this.handleStuckState();
            }
        } else {
            this.stuckDetection.stuckTime = 0;
        }

        this.stuckDetection.lastProgress = progress;
        this.lastPosition = currentPos;
    }

    calculatePathProgress(currentPos) {
        if (!this.currentPath?.waypoints?.length) return 0;

        const startPos = this.currentPath.waypoints[0];
        const endPos = this.currentPath.waypoints[this.currentPath.waypoints.length - 1];
        const totalDistance = this.calculateDistance(startPos, endPos);
        const distanceToEnd = this.calculateDistance(currentPos, endPos);

        return Math.max(0, Math.min(1, 1 - (distanceToEnd / totalDistance)));
    }

    handleStuckState() {
        // Implement stuck handling logic
        console.warn('Bot appears to be stuck in navigation');
        // Could implement various strategies like:
        // 1. Jump
        // 2. Break blocks
        // 3. Find alternative path
        // 4. Request help
    }

    async identifyObstacles(waypoints) {
        const obstacles = [];
        for (let i = 0; i < waypoints.length - 1; i++) {
            const current = waypoints[i];
            const next = waypoints[i + 1];
            
            // Check for blocks between points
            const block = this.bot.blockAt(next);
            if (block && !block.name.includes('air')) {
                obstacles.push({
                    position: next,
                    type: block.name,
                    index: i
                });
            }
        }
        return obstacles;
    }

    async generateContextualMarkers(start, end) {
        const markers = [];
        
        // Add notable blocks as markers
        const notableBlocks = ['chest', 'crafting_table', 'furnace'];
        for (const blockType of notableBlocks) {
            const block = getNearestBlock(this.bot, blockType, 16);
            if (block) {
                markers.push({
                    type: 'notable_block',
                    blockType: block.name,
                    position: block.position
                });
            }
        }

        // Add visible landmarks
        const landmarks = this.memory.getVisibleLandmarks(this.bot);
        markers.push(...landmarks.map(l => ({
            type: 'landmark',
            ...l
        })));

        return markers;
    }

    recordSuccessfulPath(start, end) {
        const pathEntry = {
            start,
            end,
            timestamp: Date.now(),
            successful: true
        };
        this.pathHistory.push(pathEntry);
        
        // Also record in memory bank
        this.memory.rememberPath(
            `${Math.floor(start.x)},${Math.floor(start.y)},${Math.floor(start.z)}`,
            `${Math.floor(end.x)},${Math.floor(end.y)},${Math.floor(end.z)}`,
            this.currentPath?.waypoints,
            this.currentPath?.obstacles
        );
    }

    recordFailedPath(start, end, error) {
        const pathEntry = {
            start,
            end,
            timestamp: Date.now(),
            successful: false,
            error: error.message
        };
        this.pathHistory.push(pathEntry);
    }

    calculateDistance(pos1, pos2) {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
}