/**
 * Bot Behaviors - 行为模拟模块
 * 参考 minecraft-fakeplayer 实现
 */

/**
 * 跟随行为
 */
export class FollowBehavior {
  constructor(bot, goals, logFn = null, onAutoStop = null) {
    this.bot = bot;
    this.goals = goals;
    this.log = logFn;
    this.onAutoStop = onAutoStop;
    this.target = null;
    this.active = false;
    this.interval = null;
    this.minDistance = 2;
    this.maxDistance = 6;
    this.lostTicks = 0;
    this.lostLimit = 5;
  }

  start(playerName, options = {}) {
    const player = this.bot.players[playerName];
    if (!player?.entity) {
      return { success: false, message: '找不到玩家' };
    }

    this.target = playerName;
    this.active = true;
    this.lostTicks = 0;
    this.minDistance = typeof options.minDistance === 'number' ? options.minDistance : 2;
    this.maxDistance = typeof options.maxDistance === 'number' ? options.maxDistance : 6;
    if (this.maxDistance < this.minDistance) {
      this.maxDistance = this.minDistance;
    }

    // 持续跟随
    this.interval = setInterval(() => {
      if (!this.active || !this.bot) {
        this.stop();
        return;
      }

      const target = this.bot.players[this.target];
      if (target?.entity) {
        this.lostTicks = 0;
        if (!this.bot.entity) return;
        const distance = this.bot.entity.position.distanceTo(target.entity.position);
        if (distance <= this.minDistance) {
          if (this.bot?.pathfinder) this.bot.pathfinder.stop();
          return;
        }
        if (distance <= this.maxDistance) {
          return;
        }
        const goal = new this.goals.GoalFollow(target.entity, this.minDistance);
        this.bot.pathfinder.setGoal(goal, true);
      } else {
        this.lostTicks += 1;
        if (this.lostTicks >= this.lostLimit) {
          this.autoStop('target_lost');
        }
      }
    }, 1000);

    return { success: true, message: `开始跟随 ${playerName}` };
  }

  autoStop(reason = 'unknown') {
    this.active = false;
    this.target = null;
    this.lostTicks = 0;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.bot?.pathfinder) {
      this.bot.pathfinder.stop();
    }
    if (this.log && reason === 'target_lost') {
      this.log('warning', '跟随目标离开，自动停止跟随', '👣');
    }
    if (this.onAutoStop) {
      this.onAutoStop('follow', reason);
    }
  }

  stop() {
    this.active = false;
    this.target = null;
    this.lostTicks = 0;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.bot?.pathfinder) {
      this.bot.pathfinder.stop();
    }
    return { success: true, message: '停止跟随' };
  }

  getStatus() {
    return {
      active: this.active,
      target: this.target,
      minDistance: this.minDistance,
      maxDistance: this.maxDistance,
      lostTicks: this.lostTicks
    };
  }
}

/**
 * 攻击行为
 */
export class AttackBehavior {
  constructor(bot, goals, logFn = null, onAutoStop = null) {
    this.bot = bot;
    this.goals = goals;
    this.log = logFn;
    this.onAutoStop = onAutoStop;
    this.active = false;
    this.mode = 'hostile'; // hostile, all, player
    this.interval = null;
    this.range = 4;
    this.whitelist = [];
    this.minHealth = 6;
    this.lastTarget = null;
  }

  start(mode = 'hostile', options = {}) {
    this.mode = mode;
    this.active = true;
    this.range = typeof options.range === 'number' ? options.range : this.range;
    if (Array.isArray(options.whitelist)) {
      this.whitelist = options.whitelist;
    }
    if (typeof options.minHealth === 'number') {
      this.minHealth = options.minHealth;
    }

    this.interval = setInterval(() => {
      if (!this.active || !this.bot) {
        this.stop();
        return;
      }

      if (typeof this.bot.health === 'number' && this.bot.health <= this.minHealth) {
        this.autoStop('low_health');
        return;
      }

      const target = this.findTarget();
      if (target) {
        this.attackEntity(target);
      }
    }, 500);

    return { success: true, message: `开始自动攻击 (模式: ${mode})` };
  }

  findTarget() {
    if (!this.bot) return null;

    const entities = Object.values(this.bot.entities);
    let nearest = null;
    let nearestDist = this.range;

    for (const entity of entities) {
      if (!entity || entity === this.bot.entity) continue;

      if (entity.type === 'player') {
        const name = entity.username || entity.name || '';
        if (name && this.whitelist.includes(name)) continue;
      }

      const dist = this.bot.entity.position.distanceTo(entity.position);
      if (dist > nearestDist) continue;

      // 根据模式筛选目标
      if (this.mode === 'hostile') {
        if (entity.type !== 'hostile') continue;
      } else if (this.mode === 'player') {
        if (entity.type !== 'player') continue;
      }
      // mode === 'all' 时攻击所有

      nearest = entity;
      nearestDist = dist;
    }

    return nearest;
  }

  attackEntity(entity) {
    if (!this.bot || !entity) return;

    try {
      // 看向目标
      this.bot.lookAt(entity.position.offset(0, entity.height * 0.85, 0));
      // 攻击
      this.bot.attack(entity);
      this.lastTarget = entity.username || entity.name || entity.type || 'unknown';
    } catch (e) {
      // 忽略攻击错误
    }
  }

  stop() {
    this.active = false;
    this.lastTarget = null;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    return { success: true, message: '停止攻击' };
  }

  autoStop(reason = 'unknown') {
    this.active = false;
    this.lastTarget = null;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.log && reason === 'low_health') {
      this.log('warning', '生命值过低，自动停止攻击', '🛡️');
    }
    if (this.onAutoStop) {
      this.onAutoStop('attack', reason);
    }
  }

  getStatus() {
    return {
      active: this.active,
      mode: this.mode,
      range: this.range,
      minHealth: this.minHealth,
      whitelistCount: this.whitelist.length,
      lastTarget: this.lastTarget
    };
  }
}

/**
 * 巡逻行为 - 完全参考 Pathfinder PRO 实现
 */
export class PatrolBehavior {
  constructor(bot, goals, logFn = null) {
    this.bot = bot;
    this.goals = goals;
    this.log = logFn;
    this.active = false;
    this.centerPos = null;
    this.isMoving = false;
    this.patrolInterval = null;
    this.moveTimeout = null;
    this.radius = 12;
    this.waypoints = [];
    this.waypointIndex = 0;
    this.onGoalReachedBound = null;
    this.onPathStopBound = null;
  }

  start(waypoints = null) {
    // 先清理旧的监听器（防止重复绑定）
    this.cleanup();

    // 检查 bot 是否准备好
    if (!this.bot?.entity) {
      if (this.log) {
        this.log('warning', '巡逻启动失败: 机器人未就绪', '⚠️');
      }
      return { success: false, message: '机器人未就绪' };
    }

    this.active = true;
    this.isMoving = false;
    this.waypointIndex = 0;

    if (Array.isArray(waypoints) && waypoints.length > 0) {
      this.waypoints = waypoints
        .map(point => ({
          x: Number(point.x),
          y: Number(point.y),
          z: Number(point.z)
        }))
        .filter(point => !Number.isNaN(point.x) && !Number.isNaN(point.y) && !Number.isNaN(point.z));
    } else {
      this.waypoints = [];
    }

    // 记录当前位置作为中心点（和 Pathfinder PRO 一样）
    try {
      this.centerPos = this.bot.entity.position.clone();
      if (this.log) {
        this.log('info', `巡逻中心点: X:${Math.floor(this.centerPos.x)} Y:${Math.floor(this.centerPos.y)} Z:${Math.floor(this.centerPos.z)}`, '📍');
      }
    } catch (e) {
      if (this.log) {
        this.log('warning', `巡逻启动失败: ${e.message}`, '⚠️');
      }
      this.active = false;
      return { success: false, message: e.message };
    }

    // 监听到达目标
    this.onGoalReachedBound = () => {
      this.clearMoveTimeout();
      this.isMoving = false;
      if (this.log && this.active) {
        this.log('info', `巡逻到达目标点`, '📍');
      }
    };
    this.bot.on('goal_reached', this.onGoalReachedBound);

    // 监听路径停止（包括无法到达的情况）
    this.onPathStopBound = () => {
      this.clearMoveTimeout();
      this.isMoving = false;
    };
    this.bot.on('path_stop', this.onPathStopBound);

    // 每 5 秒检查一次，如果不在移动就开始移动
    this.patrolInterval = setInterval(() => {
      if (!this.active || !this.bot?.entity) return;

      if (!this.isMoving) {
        this.doMove();
      }
    }, 5000);

    // 立即开始第一次移动
    this.doMove();

    return { success: true, message: '开始巡逻' };
  }

  clearMoveTimeout() {
    if (this.moveTimeout) {
      clearTimeout(this.moveTimeout);
      this.moveTimeout = null;
    }
  }

  doMove() {
    if (!this.active || !this.bot?.entity || this.isMoving) return;
    if (!this.centerPos) {
      // 尝试重新获取中心点
      try {
        this.centerPos = this.bot.entity.position.clone();
      } catch (e) {
        return;
      }
    }

    this.isMoving = true;

    // 设置 10 秒超时，如果还没到达就强制重置
    this.clearMoveTimeout();
    this.moveTimeout = setTimeout(() => {
      if (this.isMoving && this.active) {
        if (this.log) {
          this.log('info', `巡逻移动超时，重新选择目标`, '⏱️');
        }
        this.isMoving = false;
        // 停止当前路径
        if (this.bot?.pathfinder) {
          this.bot.pathfinder.stop();
        }
      }
    }, 10000);

    if (this.waypoints.length > 0) {
      const target = this.waypoints[this.waypointIndex];
      if (this.log) {
        this.log('info', `巡逻前往: X:${Math.floor(target.x)} Y:${Math.floor(target.y)} Z:${Math.floor(target.z)}`, '🚶');
      }
      this.bot.pathfinder.setGoal(new this.goals.GoalNear(target.x, target.y, target.z, 1));
      this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
      return;
    }

    // 和 Pathfinder PRO 完全一样的计算方式：offset((Math.random()-0.5)*12, 0, (Math.random()-0.5)*12)
    const targetPos = this.centerPos.offset(
      (Math.random() - 0.5) * this.radius,
      0,
      (Math.random() - 0.5) * this.radius
    );

    if (this.log) {
      this.log('info', `巡逻前往: X:${Math.floor(targetPos.x)} Z:${Math.floor(targetPos.z)}`, '🚶');
    }

    // 和 Pathfinder PRO 一样使用 GoalNear
    this.bot.pathfinder.setGoal(new this.goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 1));
  }

  cleanup() {
    if (this.patrolInterval) {
      clearInterval(this.patrolInterval);
      this.patrolInterval = null;
    }

    this.clearMoveTimeout();

    if (this.bot && this.onGoalReachedBound) {
      this.bot.removeListener('goal_reached', this.onGoalReachedBound);
      this.onGoalReachedBound = null;
    }

    if (this.bot && this.onPathStopBound) {
      this.bot.removeListener('path_stop', this.onPathStopBound);
      this.onPathStopBound = null;
    }
  }

  stop() {
    this.active = false;
    this.isMoving = false;

    this.cleanup();

    // 和 Pathfinder PRO 一样：停止时清除目标
    if (this.bot?.pathfinder) {
      this.bot.pathfinder.setGoal(null);
    }

    return { success: true, message: '停止巡逻' };
  }

  getStatus() {
    return {
      active: this.active,
      isMoving: this.isMoving,
      radius: this.radius,
      waypointsCount: this.waypoints.length,
      nextWaypointIndex: this.waypoints.length > 0 ? this.waypointIndex : null,
      centerPos: this.centerPos ? {
        x: Math.round(this.centerPos.x),
        y: Math.round(this.centerPos.y),
        z: Math.round(this.centerPos.z)
      } : null
    };
  }
}

/**
 * 挖矿行为
 */
export class MiningBehavior {
  constructor(bot, logFn = null, onAutoStop = null) {
    this.bot = bot;
    this.log = logFn;
    this.onAutoStop = onAutoStop;
    this.active = false;
    this.targetBlocks = ['coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'emerald_ore'];
    this.interval = null;
    this.range = 32;
    this.stopOnFull = true;
    this.minEmptySlots = 1;
    this.lastTargetBlock = null;
  }

  start(blockTypes = null, options = {}) {
    if (blockTypes && !Array.isArray(blockTypes) && typeof blockTypes === 'object') {
      options = blockTypes;
      blockTypes = null;
    }

    if (Array.isArray(blockTypes) && blockTypes.length > 0) {
      this.targetBlocks = blockTypes;
    }
    if (typeof options.stopOnFull === 'boolean') {
      this.stopOnFull = options.stopOnFull;
    }
    if (typeof options.minEmptySlots === 'number') {
      this.minEmptySlots = options.minEmptySlots;
    }
    this.active = true;
    this.mineLoop();
    return { success: true, message: `开始挖矿 (目标: ${this.targetBlocks.join(', ')})` };
  }

  async mineLoop() {
    while (this.active && this.bot) {
      try {
        if (this.stopOnFull && !this.hasFreeSlots()) {
          this.autoStop('inventory_full');
          break;
        }
        const block = this.findOre();
        if (block) {
          await this.mineBlock(block);
        } else {
          // 没找到矿，等待后重试
          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (e) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  findOre() {
    if (!this.bot) return null;

    for (const blockName of this.targetBlocks) {
      const blockId = this.bot.registry.blocksByName[blockName]?.id;
      if (!blockId) continue;

      const block = this.bot.findBlock({
        matching: blockId,
        maxDistance: this.range
      });

      if (block) return block;
    }
    return null;
  }

  async mineBlock(block) {
    if (!this.bot || !block) return;

    try {
      this.lastTargetBlock = block.name || 'unknown';
      // 走到矿石附近
      await this.bot.pathfinder.goto(
        new (await import('mineflayer-pathfinder')).goals.GoalNear(
          block.position.x,
          block.position.y,
          block.position.z,
          2
        )
      );

      // 看向并挖掘
      await this.bot.lookAt(block.position);
      await this.bot.dig(block);
    } catch (e) {
      // 挖掘失败，继续下一个
    }
  }

  stop() {
    this.active = false;
    this.lastTargetBlock = null;
    if (this.bot) {
      this.bot.stopDigging();
    }
    return { success: true, message: '停止挖矿' };
  }

  autoStop(reason = 'unknown') {
    this.active = false;
    this.lastTargetBlock = null;
    if (this.bot) {
      this.bot.stopDigging();
    }
    if (this.log && reason === 'inventory_full') {
      this.log('warning', '背包已满，自动停止挖矿', '🎒');
    }
    if (this.onAutoStop) {
      this.onAutoStop('mining', reason);
    }
  }

  hasFreeSlots() {
    return this.getFreeSlots() >= this.minEmptySlots;
  }

  getFreeSlots() {
    const inv = this.bot?.inventory;
    if (!inv) return 0;
    if (typeof inv.emptySlotCount === 'function') {
      return inv.emptySlotCount();
    }
    if (typeof inv.emptySlotCount === 'number') {
      return inv.emptySlotCount;
    }
    if (Array.isArray(inv.slots)) {
      return inv.slots.filter(slot => !slot).length;
    }
    return 0;
  }

  getStatus() {
    return {
      active: this.active,
      targetBlocks: this.targetBlocks,
      range: this.range,
      stopOnFull: this.stopOnFull,
      minEmptySlots: this.minEmptySlots,
      lastTargetBlock: this.lastTargetBlock
    };
  }
}

/**
 * AI 视角行为 - 自动看向附近玩家
 */
export class AiViewBehavior {
  constructor(bot) {
    this.bot = bot;
    this.active = false;
    this.interval = null;
    this.range = 16; // 检测范围
    this.lastTarget = null;
  }

  start() {
    if (this.active) return { success: false, message: 'AI 视角已在运行' };

    this.active = true;

    this.interval = setInterval(() => {
      if (!this.active || !this.bot?.entity) {
        return;
      }

      // 查找最近的玩家
      const target = this.bot.nearestEntity(entity => {
        if (!entity || entity === this.bot.entity) return false;
        if (entity.type !== 'player') return false;
        const dist = this.bot.entity.position.distanceTo(entity.position);
        return dist <= this.range;
      });

      if (target) {
        try {
          // 看向玩家头部位置
          const eyePos = target.position.offset(0, target.height * 0.85, 0);
          this.bot.lookAt(eyePos);
          this.lastTarget = target.username || target.name || 'unknown';
        } catch (e) {
          // 忽略错误
        }
      } else {
        this.lastTarget = null;
      }
    }, 500); // 每 500ms 更新一次视角

    return { success: true, message: 'AI 视角已开启' };
  }

  stop() {
    this.active = false;
    this.lastTarget = null;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    return { success: true, message: 'AI 视角已关闭' };
  }

  getStatus() {
    return {
      active: this.active,
      range: this.range,
      lastTarget: this.lastTarget
    };
  }
}

/**
 * 防踢行为 - 轻量随机动作
 */
export class AntiAfkBehavior {
  constructor(bot, logFn = null) {
    this.bot = bot;
    this.log = logFn;
    this.active = false;
    this.intervalSeconds = 45;
    this.jitterSeconds = 15;
    this.actions = ['look', 'jump', 'swing', 'sneak'];
    this.timeout = null;
    this.lastAction = null;
  }

  start(options = {}) {
    if (this.active) return { success: false, message: '防踢已在运行' };

    this.intervalSeconds = Number.isFinite(options.intervalSeconds)
      ? Math.max(5, options.intervalSeconds)
      : this.intervalSeconds;
    this.jitterSeconds = Number.isFinite(options.jitterSeconds)
      ? Math.max(0, options.jitterSeconds)
      : this.jitterSeconds;
    if (Array.isArray(options.actions) && options.actions.length > 0) {
      this.actions = options.actions.map(item => String(item));
    }

    this.active = true;
    this.scheduleNext();
    return { success: true, message: '防踢已开启' };
  }

  scheduleNext() {
    if (!this.active) return;
    const base = this.intervalSeconds * 1000;
    const jitter = this.jitterSeconds * 1000;
    const delay = Math.max(500, base + (Math.random() * 2 - 1) * jitter);
    this.timeout = setTimeout(() => {
      this.performAction();
      this.scheduleNext();
    }, delay);
  }

  performAction() {
    if (!this.active || !this.bot?.entity) return;
    const action = this.actions[Math.floor(Math.random() * this.actions.length)] || 'look';
    this.lastAction = action;

    try {
      switch (action) {
        case 'jump':
          this.bot.setControlState('jump', true);
          setTimeout(() => {
            if (this.bot) this.bot.setControlState('jump', false);
          }, 150);
          break;
        case 'swing':
          this.bot.swingArm();
          break;
        case 'sneak':
          this.bot.setControlState('sneak', true);
          setTimeout(() => {
            if (this.bot) this.bot.setControlState('sneak', false);
          }, 200);
          break;
        case 'look':
        default: {
          const pos = this.bot.entity.position;
          const target = pos.offset((Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4);
          this.bot.lookAt(target);
          break;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  stop() {
    this.active = false;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    return { success: true, message: '防踢已关闭' };
  }

  getStatus() {
    return {
      active: this.active,
      intervalSeconds: this.intervalSeconds,
      jitterSeconds: this.jitterSeconds,
      lastAction: this.lastAction
    };
  }
}

/**
 * 自动吃东西行为
 */
export class AutoEatBehavior {
  constructor(bot, logFn = null, onAutoStop = null) {
    this.bot = bot;
    this.log = logFn;
    this.onAutoStop = onAutoStop;
    this.active = false;
    this.minHealth = 6;
    this.minFood = 14;
    this.interval = null;
    this.eating = false;
    this.lastFood = null;
  }

  start(options = {}) {
    if (this.active) return { success: false, message: '自动吃已在运行' };

    if (Number.isFinite(options.minHealth)) {
      this.minHealth = Math.max(0, options.minHealth);
    }
    if (Number.isFinite(options.minFood)) {
      this.minFood = Math.max(0, options.minFood);
    }

    this.active = true;
    this.interval = setInterval(() => this.tick(), 1500);
    return { success: true, message: '自动吃已开启' };
  }

  getFoodPoints(item) {
    const registry = this.bot?.registry;
    if (!registry || !item) return 0;
    const foods = registry.foods || {};
    if (foods[item.name]?.foodPoints) return foods[item.name].foodPoints;
    const itemDef = registry.itemsByName?.[item.name];
    if (itemDef?.foodPoints) return itemDef.foodPoints;
    return 0;
  }

  isFoodItem(item) {
    if (!item) return false;
    const foodPoints = this.getFoodPoints(item);
    if (foodPoints > 0) return true;
    const fallbackFoods = new Set([
      'bread', 'apple', 'golden_apple', 'carrot', 'baked_potato',
      'cooked_beef', 'cooked_chicken', 'cooked_porkchop', 'cooked_mutton',
      'cooked_rabbit', 'cooked_cod', 'cooked_salmon', 'melon_slice'
    ]);
    return fallbackFoods.has(item.name);
  }

  findBestFood() {
    const items = this.bot?.inventory?.items?.() || [];
    const foods = items.filter(item => this.isFoodItem(item));
    if (foods.length === 0) return null;
    foods.sort((a, b) => this.getFoodPoints(b) - this.getFoodPoints(a));
    return foods[0];
  }

  async tick() {
    if (!this.active || !this.bot || this.eating) return;
    const health = typeof this.bot.health === 'number' ? this.bot.health : 20;
    const food = typeof this.bot.food === 'number' ? this.bot.food : 20;
    if (health > this.minHealth && food > this.minFood) return;

    const foodItem = this.findBestFood();
    if (!foodItem) {
      return;
    }

    this.eating = true;
    try {
      if (this.bot?.pathfinder) this.bot.pathfinder.stop();
      if (this.bot?.setControlState) {
        this.bot.setControlState('sprint', false);
        this.bot.setControlState('jump', false);
        this.bot.setControlState('sneak', false);
      }
      await this.bot.equip(foodItem, 'hand');
      if (typeof this.bot.consume === 'function') {
        await this.bot.consume();
      } else {
        this.bot.activateItem();
        await new Promise(r => setTimeout(r, 1600));
        this.bot.deactivateItem();
      }
      this.lastFood = foodItem.name;
      if (this.log) this.log('info', `自动进食: ${foodItem.name}`, '🍖');
    } catch (e) {
      // ignore eat errors
    } finally {
      this.eating = false;
    }
  }

  stop() {
    this.active = false;
    this.lastFood = null;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    return { success: true, message: '自动吃已关闭' };
  }

  getStatus() {
    return {
      active: this.active,
      minHealth: this.minHealth,
      minFood: this.minFood,
      lastFood: this.lastFood
    };
  }
}

/**
 * 守护行为 - 保护机器人自身
 */
export class GuardBehavior {
  constructor(bot, goals, logFn = null, onAutoStop = null) {
    this.bot = bot;
    this.goals = goals;
    this.log = logFn;
    this.onAutoStop = onAutoStop;
    this.active = false;
    this.radius = 8;
    this.attackRange = 3;
    this.minHealth = 12;
    this.pathCooldownMs = 800;
    this.interval = null;
    this.lastTarget = null;
    this.lastPathTime = 0;
  }

  start(options = {}) {
    if (this.active) return { success: false, message: '守护已在运行' };

    if (Number.isFinite(options.radius)) {
      this.radius = Math.max(2, options.radius);
    }
    if (Number.isFinite(options.attackRange)) {
      this.attackRange = Math.max(2, options.attackRange);
    }
    if (Number.isFinite(options.minHealth)) {
      this.minHealth = Math.max(0, options.minHealth);
    }

    if (Number.isFinite(options.pathCooldownMs)) {
      this.pathCooldownMs = Math.max(300, options.pathCooldownMs);
    }

    this.active = true;
    this.interval = setInterval(() => this.tick(), 500);
    return { success: true, message: '守护已开启' };
  }

  findTarget() {
    if (!this.bot?.entity) return null;
    const origin = this.bot.entity.position;
    let nearest = null;
    let nearestDist = this.radius;

    for (const entity of Object.values(this.bot.entities)) {
      if (!entity || entity === this.bot.entity) continue;
      if (entity.type !== 'hostile') continue;
      const dist = origin.distanceTo(entity.position);
      if (dist > nearestDist) continue;
      nearest = entity;
      nearestDist = dist;
    }

    return nearest;
  }

  tick() {
    if (!this.active || !this.bot?.entity) return;
    if (typeof this.bot.health === 'number' && this.bot.health <= this.minHealth) {
      if (this.bot?.pathfinder) this.bot.pathfinder.stop();
      if (this.bot?.setControlState) {
        this.bot.setControlState('sprint', false);
        this.bot.setControlState('jump', false);
        this.bot.setControlState('sneak', false);
      }
      this.autoStop('low_health');
      return;
    }

    const target = this.findTarget();
    if (!target) {
      this.lastTarget = null;
      if (this.bot?.pathfinder) this.bot.pathfinder.stop();
      return;
    }

    this.lastTarget = target.username || target.name || target.type || 'unknown';
    const dist = this.bot.entity.position.distanceTo(target.position);
    if (dist > this.attackRange && this.bot?.pathfinder) {
      if (this.bot.getControlState?.('sprint')) {
        this.bot.setControlState('sprint', false);
      }
      const now = Date.now();
      if (now - this.lastPathTime < this.pathCooldownMs) {
        return;
      }
      this.lastPathTime = now;
      const goal = new this.goals.GoalFollow(target, 1);
      this.bot.pathfinder.setGoal(goal, true);
      return;
    }

    try {
      this.bot.lookAt(target.position.offset(0, target.height * 0.85, 0));
      this.bot.attack(target);
    } catch (e) {
      // ignore
    }
  }

  autoStop(reason = 'unknown') {
    this.active = false;
    this.lastTarget = null;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.bot?.pathfinder) this.bot.pathfinder.stop();
    if (this.bot?.setControlState) {
      this.bot.setControlState('sprint', false);
      this.bot.setControlState('jump', false);
      this.bot.setControlState('sneak', false);
    }
    if (this.log && reason === 'low_health') {
      this.log('warning', '生命值过低，自动停止守护', '🛡️');
    }
    if (this.onAutoStop) {
      this.onAutoStop('guard', reason);
    }
  }

  stop() {
    this.active = false;
    this.lastTarget = null;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.bot?.pathfinder) this.bot.pathfinder.stop();
    return { success: true, message: '守护已关闭' };
  }

  getStatus() {
    return {
      active: this.active,
      radius: this.radius,
      attackRange: this.attackRange,
      minHealth: this.minHealth,
      lastTarget: this.lastTarget
    };
  }
}

/**
 * 自动钓鱼行为
 */
export class FishingBehavior {
  constructor(bot, logFn = null, onAutoStop = null) {
    this.bot = bot;
    this.log = logFn;
    this.onAutoStop = onAutoStop;
    this.active = false;
    this.intervalSeconds = 2;
    this.timeoutSeconds = 25;
    this.fishing = false;
    this.lastResult = null;
  }

  start(options = {}) {
    if (this.active) return { success: false, message: '自动钓鱼已在运行' };

    if (Number.isFinite(options.intervalSeconds)) {
      this.intervalSeconds = Math.max(1, options.intervalSeconds);
    }
    if (Number.isFinite(options.timeoutSeconds)) {
      this.timeoutSeconds = Math.max(5, options.timeoutSeconds);
    }

    this.active = true;
    this.loop();
    return { success: true, message: '自动钓鱼已开启' };
  }

  async loop() {
    while (this.active && this.bot) {
      if (this.fishing) {
        await new Promise(r => setTimeout(r, 300));
        continue;
      }

      const rod = (this.bot.inventory?.items?.() || []).find(item => item.name === 'fishing_rod');
      if (!rod) {
        this.lastResult = '没有钓鱼竿';
        if (this.log) this.log('warning', '自动钓鱼失败: 未找到钓鱼竿', '🎣');
        this.autoStop('no_rod');
        break;
      }

      if (typeof this.bot.fish !== 'function') {
        this.lastResult = '不支持钓鱼';
        if (this.log) this.log('warning', '当前版本不支持自动钓鱼', '🎣');
        this.autoStop('unsupported');
        break;
      }

      this.fishing = true;
      try {
        await this.bot.equip(rod, 'hand');
        await Promise.race([
          this.bot.fish(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), this.timeoutSeconds * 1000))
        ]);
        this.lastResult = '钓鱼成功';
      } catch (e) {
        this.lastResult = e?.message || '钓鱼失败';
      } finally {
        this.fishing = false;
      }

      await new Promise(r => setTimeout(r, this.intervalSeconds * 1000));
    }
  }

  autoStop(reason = 'unknown') {
    this.active = false;
    if (this.bot) this.bot.deactivateItem();
    if (this.onAutoStop) {
      this.onAutoStop('fishing', reason);
    }
  }

  stop() {
    this.active = false;
    if (this.bot) this.bot.deactivateItem();
    return { success: true, message: '自动钓鱼已关闭' };
  }

  getStatus() {
    return {
      active: this.active,
      intervalSeconds: this.intervalSeconds,
      timeoutSeconds: this.timeoutSeconds,
      lastResult: this.lastResult
    };
  }
}

/**
 * 消息限速行为 - 限制 bot.chat 频率
 */
export class RateLimitBehavior {
  constructor(bot, logFn = null) {
    this.bot = bot;
    this.log = logFn;
    this.active = false;
    this.globalCooldownSeconds = 1;
    this.maxPerMinute = 20;
    this.lastChatTime = 0;
    this.windowStart = 0;
    this.windowCount = 0;
    this.blockedCount = 0;
    this.originalChat = null;
  }

  start(options = {}) {
    if (this.active) return { success: false, message: '限速已在运行' };

    if (Number.isFinite(options.globalCooldownSeconds)) {
      this.globalCooldownSeconds = Math.max(0, options.globalCooldownSeconds);
    }
    if (Number.isFinite(options.maxPerMinute)) {
      this.maxPerMinute = Math.max(0, options.maxPerMinute);
    }

    if (!this.bot?.chat) return { success: false, message: 'Bot 未就绪' };

    this.active = true;
    this.blockedCount = 0;
    this.originalChat = this.bot.chat.bind(this.bot);
    this.bot.chat = (message) => {
      if (!this.active) return this.originalChat(message);
      if (this.shouldBlock()) {
        this.blockedCount += 1;
        return;
      }
      return this.originalChat(message);
    };
    return { success: true, message: '限速已开启' };
  }

  shouldBlock() {
    const now = Date.now();
    const minInterval = this.globalCooldownSeconds * 1000;
    if (minInterval > 0 && now - this.lastChatTime < minInterval) {
      return true;
    }
    this.lastChatTime = now;

    if (this.maxPerMinute > 0) {
      if (!this.windowStart || now - this.windowStart > 60000) {
        this.windowStart = now;
        this.windowCount = 0;
      }
      if (this.windowCount >= this.maxPerMinute) {
        return true;
      }
      this.windowCount += 1;
    }

    return false;
  }

  stop() {
    this.active = false;
    if (this.bot && this.originalChat) {
      this.bot.chat = this.originalChat;
    }
    this.originalChat = null;
    return { success: true, message: '限速已关闭' };
  }

  getStatus() {
    return {
      active: this.active,
      globalCooldownSeconds: this.globalCooldownSeconds,
      maxPerMinute: this.maxPerMinute,
      blockedCount: this.blockedCount
    };
  }
}

/**
 * 拟人化行为 - 轻量随机动作与视角
 */
export class HumanizeBehavior {
  constructor(bot, logFn = null) {
    this.bot = bot;
    this.log = logFn;
    this.active = false;
    this.intervalSeconds = 18;
    this.lookRange = 6;
    this.actionChance = 0.6;
    this.stepChance = 0.3;
    this.sneakChance = 0.2;
    this.swingChance = 0.2;
    this.timeout = null;
    this.lastAction = null;
  }

  start(options = {}) {
    if (this.active) return { success: false, message: '拟人已在运行' };

    if (Number.isFinite(options.intervalSeconds)) {
      this.intervalSeconds = Math.max(5, options.intervalSeconds);
    }
    if (Number.isFinite(options.lookRange)) {
      this.lookRange = Math.max(2, options.lookRange);
    }
    if (Number.isFinite(options.actionChance)) {
      this.actionChance = Math.min(1, Math.max(0, options.actionChance));
    }
    if (Number.isFinite(options.stepChance)) {
      this.stepChance = Math.min(1, Math.max(0, options.stepChance));
    }
    if (Number.isFinite(options.sneakChance)) {
      this.sneakChance = Math.min(1, Math.max(0, options.sneakChance));
    }
    if (Number.isFinite(options.swingChance)) {
      this.swingChance = Math.min(1, Math.max(0, options.swingChance));
    }

    this.active = true;
    this.scheduleNext();
    return { success: true, message: '拟人已开启' };
  }

  scheduleNext() {
    if (!this.active) return;
    const base = this.intervalSeconds * 1000;
    const jitter = Math.max(500, base * 0.35);
    const delay = Math.max(800, base + (Math.random() * 2 - 1) * jitter);
    this.timeout = setTimeout(() => {
      this.tick();
      this.scheduleNext();
    }, delay);
  }

  tick() {
    if (!this.active || !this.bot?.entity) return;
    if (Math.random() > this.actionChance) return;

    if (Math.random() < this.stepChance && !this.bot?.pathfinder?.isMoving()) {
      this.doStep();
      return;
    }

    if (Math.random() < this.sneakChance) {
      this.doSneak();
      return;
    }

    if (Math.random() < this.swingChance) {
      this.bot.swingArm();
      this.lastAction = 'swing';
      return;
    }

    this.doLook();
  }

  doLook() {
    const pos = this.bot.entity.position;
    const target = pos.offset(
      (Math.random() - 0.5) * this.lookRange * 2,
      Math.random() * 2,
      (Math.random() - 0.5) * this.lookRange * 2
    );
    this.bot.lookAt(target);
    this.lastAction = 'look';
  }

  doSneak() {
    this.lastAction = 'sneak';
    this.bot.setControlState('sneak', true);
    setTimeout(() => {
      if (this.bot) this.bot.setControlState('sneak', false);
    }, 200 + Math.random() * 200);
  }

  doStep() {
    this.lastAction = 'step';
    this.bot.setControlState('sprint', false);
    const move = Math.random() > 0.5 ? 'forward' : 'back';
    const strafe = Math.random() > 0.5 ? 'left' : 'right';
    if (Math.random() > 0.5) {
      this.bot.setControlState(move, true);
    } else {
      this.bot.setControlState(strafe, true);
    }
    setTimeout(() => {
      if (this.bot) {
        this.bot.setControlState(move, false);
        this.bot.setControlState(strafe, false);
      }
    }, 180 + Math.random() * 220);
  }

  stop() {
    this.active = false;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    return { success: true, message: '拟人已关闭' };
  }

  getStatus() {
    return {
      active: this.active,
      intervalSeconds: this.intervalSeconds,
      lookRange: this.lookRange,
      actionChance: this.actionChance,
      lastAction: this.lastAction
    };
  }
}

/**
 * 安全挂机行为 - 随机动作 + 视角 + 超时保护
 */
export class SafeIdleBehavior {
  constructor(bot, logFn = null) {
    this.bot = bot;
    this.log = logFn;
    this.active = false;
    this.intervalSeconds = 20;
    this.lookRange = 6;
    this.actionChance = 0.5;
    this.timeoutSeconds = 45;
    this.timeout = null;
    this.lastAction = null;
    this.lastPosition = null;
    this.lastMoveAt = 0;
  }

  start(options = {}) {
    if (this.active) return { success: false, message: '安全挂机已在运行' };

    if (Number.isFinite(options.intervalSeconds)) {
      this.intervalSeconds = Math.max(5, options.intervalSeconds);
    }
    if (Number.isFinite(options.lookRange)) {
      this.lookRange = Math.max(2, options.lookRange);
    }
    if (Number.isFinite(options.actionChance)) {
      this.actionChance = Math.min(1, Math.max(0, options.actionChance));
    }
    if (Number.isFinite(options.timeoutSeconds)) {
      this.timeoutSeconds = Math.max(10, options.timeoutSeconds);
    }

    this.active = true;
    this.lastPosition = this.bot?.entity?.position?.clone?.() || null;
    this.lastMoveAt = Date.now();
    this.scheduleNext();
    return { success: true, message: '安全挂机已开启' };
  }

  scheduleNext() {
    if (!this.active) return;
    const base = this.intervalSeconds * 1000;
    const jitter = Math.max(500, base * 0.4);
    const delay = Math.max(800, base + (Math.random() * 2 - 1) * jitter);
    this.timeout = setTimeout(() => {
      this.tick();
      this.scheduleNext();
    }, delay);
  }

  tick() {
    if (!this.active || !this.bot?.entity) return;

    this.checkTimeout();

    if (Math.random() > this.actionChance) return;
    const roll = Math.random();
    if (roll < 0.4) {
      this.doLook();
    } else if (roll < 0.7) {
      this.doSneak();
    } else if (roll < 0.9) {
      this.bot.swingArm();
      this.lastAction = 'swing';
    } else {
      this.doStep();
    }
  }

  checkTimeout() {
    if (!this.bot?.entity) return;
    const pos = this.bot.entity.position;
    if (this.lastPosition) {
      const moved = pos.distanceTo(this.lastPosition);
      if (moved > 0.2) {
        this.lastMoveAt = Date.now();
        this.lastPosition = pos.clone();
      }
    } else {
      this.lastPosition = pos.clone();
      this.lastMoveAt = Date.now();
    }

    const moving = this.bot?.pathfinder?.isMoving?.() || false;
    if (moving && Date.now() - this.lastMoveAt > this.timeoutSeconds * 1000) {
      if (this.bot?.pathfinder) this.bot.pathfinder.stop();
      if (this.bot?.setControlState) {
        this.bot.setControlState('sprint', false);
        this.bot.setControlState('jump', false);
        this.bot.setControlState('sneak', false);
      }
      this.lastAction = 'timeout_stop';
      this.lastMoveAt = Date.now();
      if (this.log) this.log('warning', '安全挂机触发超时保护，已停止移动', '⏸️');
    }
  }

  doLook() {
    const pos = this.bot.entity.position;
    const target = pos.offset(
      (Math.random() - 0.5) * this.lookRange * 2,
      Math.random() * 2,
      (Math.random() - 0.5) * this.lookRange * 2
    );
    this.bot.lookAt(target);
    this.lastAction = 'look';
  }

  doSneak() {
    this.lastAction = 'sneak';
    this.bot.setControlState('sneak', true);
    setTimeout(() => {
      if (this.bot) this.bot.setControlState('sneak', false);
    }, 200 + Math.random() * 200);
  }

  doStep() {
    this.lastAction = 'step';
    this.bot.setControlState('sprint', false);
    const move = Math.random() > 0.5 ? 'forward' : 'back';
    const strafe = Math.random() > 0.5 ? 'left' : 'right';
    if (Math.random() > 0.5) {
      this.bot.setControlState(move, true);
    } else {
      this.bot.setControlState(strafe, true);
    }
    setTimeout(() => {
      if (this.bot) {
        this.bot.setControlState(move, false);
        this.bot.setControlState(strafe, false);
      }
    }, 160 + Math.random() * 220);
  }

  stop() {
    this.active = false;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    return { success: true, message: '安全挂机已关闭' };
  }

  getStatus() {
    return {
      active: this.active,
      intervalSeconds: this.intervalSeconds,
      lookRange: this.lookRange,
      actionChance: this.actionChance,
      timeoutSeconds: this.timeoutSeconds,
      lastAction: this.lastAction
    };
  }
}

/**
 * 任务脚本 - 挖矿 -> 回收 -> 巡逻 -> 休息
 */
export class WorkflowBehavior {
  constructor(bot, controller, logFn = null) {
    this.bot = bot;
    this.controller = controller;
    this.log = logFn;
    this.active = false;
    this.steps = ['mining', 'patrol', 'rest'];
    this.currentIndex = 0;
    this.patrolSeconds = 120;
    this.restSeconds = 40;
    this.miningMaxSeconds = 240;
    this.stepTimer = null;
    this.startedAt = 0;
    this.lastReason = null;
  }

  start(options = {}) {
    if (this.active) return { success: false, message: '任务脚本已在运行' };

    if (Array.isArray(options.steps) && options.steps.length > 0) {
      this.steps = options.steps.map(step => String(step));
    }
    if (Number.isFinite(options.patrolSeconds)) {
      this.patrolSeconds = Math.max(10, options.patrolSeconds);
    }
    if (Number.isFinite(options.restSeconds)) {
      this.restSeconds = Math.max(5, options.restSeconds);
    }
    if (Number.isFinite(options.miningMaxSeconds)) {
      this.miningMaxSeconds = Math.max(30, options.miningMaxSeconds);
    }

    this.active = true;
    this.currentIndex = 0;
    this.lastReason = null;
    this.startStep();
    return { success: true, message: '任务脚本已开启' };
  }

  startStep() {
    if (!this.active) return;
    const step = this.steps[this.currentIndex] || 'rest';
    this.startedAt = Date.now();
    this.clearTimer();

    switch (step) {
      case 'mining':
        this.controller.startMining?.();
        this.stepTimer = setTimeout(() => this.completeStep('timeout'), this.miningMaxSeconds * 1000);
        break;
      case 'patrol':
        this.controller.startPatrol?.();
        this.stepTimer = setTimeout(() => this.completeStep('timeout'), this.patrolSeconds * 1000);
        break;
      case 'rest':
      default:
        this.controller.stopAllMovement?.();
        this.stepTimer = setTimeout(() => this.completeStep('timeout'), this.restSeconds * 1000);
        break;
    }
  }

  completeStep(reason = 'done') {
    if (!this.active) return;
    const step = this.steps[this.currentIndex] || 'rest';
    this.lastReason = `${step}:${reason}`;
    if (step === 'mining') this.controller.stopMining?.();
    if (step === 'patrol') this.controller.stopPatrol?.();
    if (step === 'rest') this.controller.stopAllMovement?.();
    this.currentIndex = (this.currentIndex + 1) % this.steps.length;
    this.startStep();
  }

  onStepComplete(step, reason = 'done') {
    const current = this.steps[this.currentIndex];
    if (!this.active || current !== step) return;
    this.completeStep(reason);
  }

  stop() {
    this.active = false;
    this.clearTimer();
    this.controller.stopMining?.();
    this.controller.stopPatrol?.();
    this.controller.stopAllMovement?.();
    return { success: true, message: '任务脚本已关闭' };
  }

  clearTimer() {
    if (this.stepTimer) {
      clearTimeout(this.stepTimer);
      this.stepTimer = null;
    }
  }

  getStatus() {
    const step = this.steps[this.currentIndex] || 'rest';
    const elapsed = this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0;
    return {
      active: this.active,
      step,
      steps: this.steps,
      elapsedSeconds: elapsed,
      lastReason: this.lastReason
    };
  }
}

/**
 * 动作行为 - 模拟玩家动作
 */
export class ActionBehavior {
  constructor(bot) {
    this.bot = bot;
    this.loopInterval = null;
    this.actions = [];
    this.looping = false;
  }

  // 跳跃
  jump() {
    if (!this.bot) return;
    this.bot.setControlState('jump', true);
    setTimeout(() => {
      if (this.bot) this.bot.setControlState('jump', false);
    }, 100);
    return { success: true, message: '跳跃' };
  }

  // 蹲下
  sneak(enabled = true) {
    if (!this.bot) return;
    this.bot.setControlState('sneak', enabled);
    return { success: true, message: enabled ? '蹲下' : '站起' };
  }

  // 冲刺
  sprint(enabled = true) {
    if (!this.bot) return;
    this.bot.setControlState('sprint', enabled);
    return { success: true, message: enabled ? '冲刺' : '停止冲刺' };
  }

  // 使用物品 (右键)
  useItem() {
    if (!this.bot) return;
    this.bot.activateItem();
    return { success: true, message: '使用物品' };
  }

  // 放下物品
  deactivateItem() {
    if (!this.bot) return;
    this.bot.deactivateItem();
    return { success: true, message: '放下物品' };
  }

  // 左键攻击/挖掘
  swing() {
    if (!this.bot) return;
    this.bot.swingArm();
    return { success: true, message: '挥动手臂' };
  }

  // 看向位置
  lookAt(x, y, z) {
    if (!this.bot) return;
    this.bot.lookAt({ x, y, z });
    return { success: true, message: `看向 (${x}, ${y}, ${z})` };
  }

  // 循环执行动作
  startLoop(actionList, intervalMs = 1000) {
    this.actions = actionList;
    this.looping = true;
    let index = 0;

    this.loopInterval = setInterval(() => {
      if (!this.looping || !this.bot) {
        this.stopLoop();
        return;
      }

      const action = this.actions[index];
      this.executeAction(action);
      index = (index + 1) % this.actions.length;
    }, intervalMs);

    return { success: true, message: `开始循环动作 (${actionList.length} 个)` };
  }

  executeAction(action) {
    switch (action.type) {
      case 'jump':
        this.jump();
        break;
      case 'sneak':
        this.sneak(action.enabled);
        break;
      case 'sprint':
        this.sprint(action.enabled);
        break;
      case 'useItem':
        this.useItem();
        break;
      case 'swing':
        this.swing();
        break;
      case 'lookAt':
        this.lookAt(action.x, action.y, action.z);
        break;
    }
  }

  stopLoop() {
    this.looping = false;
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    return { success: true, message: '停止循环动作' };
  }

  getStatus() {
    return {
      looping: this.looping,
      actionsCount: this.actions.length
    };
  }
}

/**
 * 行为管理器 - 统一管理所有行为
 */
export class BehaviorManager {
  constructor(bot, goals, logFn = null, onAutoStop = null, controller = null) {
    this.bot = bot;
    this.goals = goals;
    this.log = logFn;
    this.onAutoStop = onAutoStop;

    this.follow = new FollowBehavior(bot, goals, logFn, onAutoStop);
    this.attack = new AttackBehavior(bot, goals, logFn, onAutoStop);
    this.patrol = new PatrolBehavior(bot, goals, logFn); // 传递日志函数
    this.mining = new MiningBehavior(bot, logFn, onAutoStop);
    this.action = new ActionBehavior(bot);
    this.aiView = new AiViewBehavior(bot);
    this.antiAfk = new AntiAfkBehavior(bot, logFn);
    this.autoEat = new AutoEatBehavior(bot, logFn, onAutoStop);
    this.guard = new GuardBehavior(bot, goals, logFn, onAutoStop);
    this.fishing = new FishingBehavior(bot, logFn, onAutoStop);
    this.rateLimit = new RateLimitBehavior(bot, logFn);
    this.humanize = new HumanizeBehavior(bot, logFn);
    this.safeIdle = new SafeIdleBehavior(bot, logFn);
    this.workflow = new WorkflowBehavior(bot, controller, logFn);
  }

  stopAll() {
    this.follow.stop();
    this.attack.stop();
    this.patrol.stop();
    this.mining.stop();
    this.action.stopLoop();
    this.aiView.stop();
    this.antiAfk.stop();
    this.autoEat.stop();
    this.guard.stop();
    this.fishing.stop();
    this.rateLimit.stop();
    this.humanize.stop();
    this.safeIdle.stop();
    this.workflow.stop();
    return { success: true, message: '已停止所有行为' };
  }

  getStatus() {
    return {
      follow: this.follow.getStatus(),
      attack: this.attack.getStatus(),
      patrol: this.patrol.getStatus(),
      mining: this.mining.getStatus(),
      action: this.action.getStatus(),
      aiView: this.aiView.getStatus(),
      antiAfk: this.antiAfk.getStatus(),
      autoEat: this.autoEat.getStatus(),
      guard: this.guard.getStatus(),
      fishing: this.fishing.getStatus(),
      rateLimit: this.rateLimit.getStatus(),
      humanize: this.humanize.getStatus(),
      safeIdle: this.safeIdle.getStatus(),
      workflow: this.workflow.getStatus()
    };
  }
}
