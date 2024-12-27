export class GoalSystem {
    constructor() {
        this.mainGoal = null;
        this.subGoals = [];
        this.completedGoals = [];
        this.failedGoals = [];
        this.contextualMemory = {};
        this.strategyAdaptations = [];
    }

    setMainGoal(goal, context = {}) {
        this.mainGoal = {
            id: `goal_${Date.now()}`,
            description: goal,
            startTime: Date.now(),
            context: context,
            status: 'active',
            progress: 0,
            subGoals: [],
            attempts: 0,
            lastUpdate: Date.now()
        };
        return this.mainGoal.id;
    }

    addSubGoal(description, prerequisites = [], dependencies = []) {
        const subGoal = {
            id: `subgoal_${Date.now()}_${this.subGoals.length}`,
            description,
            prerequisites,
            dependencies,
            status: 'pending',
            attempts: 0,
            lastAttempt: null,
            created: Date.now(),
            progress: 0
        };
        this.subGoals.push(subGoal);
        return subGoal.id;
    }

    updateGoalProgress(goalId, progress, context = {}) {
        const goal = this.findGoal(goalId);
        if (goal) {
            goal.progress = progress;
            goal.lastUpdate = Date.now();
            goal.context = {...goal.context, ...context};
            
            // Update main goal progress based on subgoals
            if (this.mainGoal && goalId !== this.mainGoal.id) {
                this.updateMainGoalProgress();
            }
        }
    }

    updateMainGoalProgress() {
        if (!this.mainGoal) return;
        
        const activeSubGoals = this.subGoals.filter(g => g.status !== 'completed' && g.status !== 'failed');
        if (activeSubGoals.length === 0) {
            this.mainGoal.progress = this.subGoals.length > 0 ? 100 : this.mainGoal.progress;
            return;
        }

        const totalProgress = this.subGoals.reduce((sum, goal) => {
            return sum + (goal.status === 'completed' ? 100 : goal.progress);
        }, 0);

        this.mainGoal.progress = Math.floor(totalProgress / this.subGoals.length);
    }

    findGoal(goalId) {
        if (this.mainGoal && this.mainGoal.id === goalId) {
            return this.mainGoal;
        }
        return this.subGoals.find(g => g.id === goalId);
    }

    recordFailedAttempt(goalId, reason) {
        const goal = this.findGoal(goalId);
        if (goal) {
            goal.attempts += 1;
            goal.lastAttempt = {
                timestamp: Date.now(),
                reason: reason
            };

            if (goal.attempts > 3) {
                this.adaptStrategy(goal);
            }
        }
    }

    adaptStrategy(goal) {
        const adaptation = {
            goalId: goal.id,
            timestamp: Date.now(),
            previousAttempts: goal.attempts,
            reason: goal.lastAttempt?.reason || 'Too many failures'
        };

        // Record the adaptation
        this.strategyAdaptations.push(adaptation);

        // Mark the goal for strategy revision
        goal.needsStrategyRevision = true;
        goal.status = 'needs_revision';
    }

    completeGoal(goalId) {
        const goal = this.findGoal(goalId);
        if (goal) {
            goal.status = 'completed';
            goal.completedAt = Date.now();
            this.completedGoals.push({...goal});
            
            // Remove from active subgoals if it's a subgoal
            if (goalId !== this.mainGoal?.id) {
                this.subGoals = this.subGoals.filter(g => g.id !== goalId);
            }

            this.updateMainGoalProgress();
        }
    }

    failGoal(goalId, reason) {
        const goal = this.findGoal(goalId);
        if (goal) {
            goal.status = 'failed';
            goal.failedAt = Date.now();
            goal.failureReason = reason;
            this.failedGoals.push({...goal});

            // Remove from active subgoals if it's a subgoal
            if (goalId !== this.mainGoal?.id) {
                this.subGoals = this.subGoals.filter(g => g.id !== goalId);
            }

            this.updateMainGoalProgress();
        }
    }

    getActiveSubGoals() {
        return this.subGoals.filter(g => g.status === 'active' || g.status === 'pending');
    }

    getPendingPrerequisites(goalId) {
        const goal = this.findGoal(goalId);
        if (!goal) return [];

        return goal.prerequisites.filter(preReqId => {
            const preReqGoal = this.findGoal(preReqId);
            return preReqGoal && preReqGoal.status !== 'completed';
        });
    }

    canStartGoal(goalId) {
        const goal = this.findGoal(goalId);
        if (!goal) return false;

        // Check prerequisites
        const pendingPrereqs = this.getPendingPrerequisites(goalId);
        if (pendingPrereqs.length > 0) return false;

        // Check dependencies
        const unmetDependencies = goal.dependencies.filter(depId => {
            const depGoal = this.findGoal(depId);
            return !depGoal || depGoal.status !== 'completed';
        });

        return unmetDependencies.length === 0;
    }

    getGoalSummary() {
        return {
            mainGoal: this.mainGoal ? {
                description: this.mainGoal.description,
                progress: this.mainGoal.progress,
                status: this.mainGoal.status,
                timeRunning: Date.now() - this.mainGoal.startTime
            } : null,
            activeSubGoals: this.getActiveSubGoals().map(g => ({
                description: g.description,
                progress: g.progress,
                status: g.status,
                attempts: g.attempts
            })),
            completedCount: this.completedGoals.length,
            failedCount: this.failedGoals.length,
            adaptationCount: this.strategyAdaptations.length
        };
    }
}