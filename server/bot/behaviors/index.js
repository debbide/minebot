/**
 * Bot Behaviors - 行为模拟模块
 * 参考 minecraft-fakeplayer 实现
 */

/**
 * 跟随行为
 */
export class FollowBehavior {
  constructor(bot, goals) {
    this.bot = bot;
    this.goals = goals;
    this.target = null;
    this.active = false;
    this.interval = null;
  }

  start(playerName) {
    const player = this.bot.players[playerName];
    if (!player?.entity) {
      return { success: false, message: '找不到玩家' };
    }

    this.target = playerName;
    this.active = true;

    // 持续跟随
    this.interval = setInterval(() => {
      if (!this.active || !this.bot) {
        this.stop();
        return;
      }

      const target = this.bot.players[this.target];
      if (target?.entity) {
        const goal = new this.goals.GoalFollow(target.entity, 2);
        this.bot.pathfinder.setGoal(goal, true);
      }
    }, 1000);

    return { success: true, message: `开始跟随 ${playerName}` };
  }

  stop() {
    this.active = false;
    this.target = null;
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
      target: this.target
    };
  }
}

/**
 * 攻击行为
 */
export class AttackBehavior {
  constructor(bot, goals) {
    this.bot = bot;
    this.goals = goals;
    this.active = false;
    this.mode = 'hostile'; // hostile, all, player
    this.interval = null;
    this.range = 4;
  }

  start(mode = 'hostile') {
    this.mode = mode;
    this.active = true;

    this.interval = setInterval(() => {
      if (!this.active || !this.bot) {
        this.stop();
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
    } catch (e) {
      // 忽略攻击错误
    }
  }

  stop() {
    this.active = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    return { success: true, message: '停止攻击' };
  }

  getStatus() {
    return {
      active: this.active,
      mode: this.mode,
      range: this.range
    };
  }
}

/**
 * 巡逻行为
 */
export class PatrolBehavior {
  constructor(bot, goals, logFn = null) {
    this.bot = bot;
    this.goals = goals;
    this.log = logFn; // 日志函数
    this.active = false;
    this.waypoints = [];
    this.currentIndex = 0;
    this.interval = null;
    this.radius = 12; // 随机巡逻半径
    this.centerPos = null; // 巡逻中心点
    this.isMoving = false;
    this.patrolTimeout = null;
  }

  start(waypoints = null) {
    this.active = true;
    this.isMoving = false;

    // 记录当前位置作为中心点（如果没有设置的话）
    if (!this.centerPos && this.bot?.entity) {
      this.centerPos = this.bot.entity.position.clone();
      if (this.log) {
        this.log('info', `巡逻中心点: X:${Math.floor(this.centerPos.x)} Y:${Math.floor(this.centerPos.y)} Z:${Math.floor(this.centerPos.z)}`, '📍');
      }
    }

    if (waypoints && waypoints.length > 0) {
      // 使用指定路径点
      this.waypoints = waypoints;
      this.currentIndex = 0;
      this.patrolWaypoints();
    } else {
      // 随机巡逻
      this.startRandomPatrol();
    }

    return { success: true, message: '开始巡逻' };
  }

  startRandomPatrol() {
    if (!this.active || !this.bot) return;

    // 监听到达目标事件
    this.bot.on('goal_reached', this.onGoalReached.bind(this));

    // 开始第一次巡逻
    this.doRandomMove();
  }

  onGoalReached() {
    if (!this.active) return;
    this.isMoving = false;

    // 记录到达位置
    if (this.log && this.bot?.entity) {
      const pos = this.bot.entity.position;
      this.log('info', `巡逻到达: X:${Math.floor(pos.x)} Y:${Math.floor(pos.y)} Z:${Math.floor(pos.z)}`, '📍');
    }

    // 随机等待后继续巡逻
    const waitTime = 3000 + Math.random() * 5000;
    this.patrolTimeout = setTimeout(() => {
      if (this.active) {
        this.doRandomMove();
      }
    }, waitTime);
  }

  doRandomMove() {
    if (!this.active || !this.bot?.entity || this.isMoving) return;

    // 以中心点为基准随机移动
    const center = this.centerPos || this.bot.entity.position;
    const offsetX = (Math.random() - 0.5) * this.radius * 2;
    const offsetZ = (Math.random() - 0.5) * this.radius * 2;

    const targetX = center.x + offsetX;
    const targetZ = center.z + offsetZ;

    try {
      const goal = new this.goals.GoalNear(targetX, center.y, targetZ, 1);
      this.bot.pathfinder.setGoal(goal);
      this.isMoving = true;

      if (this.log) {
        this.log('info', `巡逻前往: X:${Math.floor(targetX)} Z:${Math.floor(targetZ)}`, '🚶');
      }
    } catch (e) {
      // 忽略路径规划错误
      this.isMoving = false;
    }
  }

  patrolWaypoints() {
    if (!this.active || !this.bot || this.waypoints.length === 0) return;

    const wp = this.waypoints[this.currentIndex];
    const goal = new this.goals.GoalNear(wp.x, wp.y, wp.z, 2);

    this.bot.pathfinder.setGoal(goal);

    this.bot.once('goal_reached', () => {
      if (!this.active) return;
      this.currentIndex = (this.currentIndex + 1) % this.waypoints.length;
      setTimeout(() => this.patrolWaypoints(), 2000);
    });
  }

  addWaypoint(x, y, z) {
    this.waypoints.push({ x, y, z });
    return { success: true, message: `添加路径点 (${x}, ${y}, ${z})` };
  }

  clearWaypoints() {
    this.waypoints = [];
    this.currentIndex = 0;
    return { success: true, message: '清除所有路径点' };
  }

  stop() {
    this.active = false;
    this.isMoving = false;

    // 清除定时器
    if (this.patrolTimeout) {
      clearTimeout(this.patrolTimeout);
      this.patrolTimeout = null;
    }

    // 移除事件监听
    if (this.bot) {
      this.bot.removeListener('goal_reached', this.onGoalReached);
    }

    if (this.bot?.pathfinder) {
      this.bot.pathfinder.stop();
    }
    return { success: true, message: '停止巡逻' };
  }

  getStatus() {
    return {
      active: this.active,
      waypoints: this.waypoints.length,
      currentIndex: this.currentIndex,
      radius: this.radius,
      isMoving: this.isMoving,
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
  constructor(bot) {
    this.bot = bot;
    this.active = false;
    this.targetBlocks = ['coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'emerald_ore'];
    this.interval = null;
    this.range = 32;
  }

  start(blockTypes = null) {
    if (blockTypes) {
      this.targetBlocks = blockTypes;
    }
    this.active = true;
    this.mineLoop();
    return { success: true, message: `开始挖矿 (目标: ${this.targetBlocks.join(', ')})` };
  }

  async mineLoop() {
    while (this.active && this.bot) {
      try {
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
    if (this.bot) {
      this.bot.stopDigging();
    }
    return { success: true, message: '停止挖矿' };
  }

  getStatus() {
    return {
      active: this.active,
      targetBlocks: this.targetBlocks,
      range: this.range
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
  constructor(bot, goals, logFn = null) {
    this.bot = bot;
    this.goals = goals;
    this.log = logFn;

    this.follow = new FollowBehavior(bot, goals);
    this.attack = new AttackBehavior(bot, goals);
    this.patrol = new PatrolBehavior(bot, goals, logFn); // 传递日志函数
    this.mining = new MiningBehavior(bot);
    this.action = new ActionBehavior(bot);
    this.aiView = new AiViewBehavior(bot);
  }

  stopAll() {
    this.follow.stop();
    this.attack.stop();
    this.patrol.stop();
    this.mining.stop();
    this.action.stopLoop();
    this.aiView.stop();
    return { success: true, message: '已停止所有行为' };
  }

  getStatus() {
    return {
      follow: this.follow.getStatus(),
      attack: this.attack.getStatus(),
      patrol: this.patrol.getStatus(),
      mining: this.mining.getStatus(),
      action: this.action.getStatus(),
      aiView: this.aiView.getStatus()
    };
  }
}
