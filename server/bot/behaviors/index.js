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
    this.radius = 12;
    this.onGoalReachedBound = null;
    this.onPathStopBound = null;
  }

  start() {
    // 先清理旧的监听器（防止重复绑定）
    this.cleanup();

    this.active = true;
    this.isMoving = false;

    // 记录当前位置作为中心点（和 Pathfinder PRO 一样）
    if (this.bot?.entity) {
      this.centerPos = this.bot.entity.position.clone();
      if (this.log) {
        this.log('info', `巡逻中心点: X:${Math.floor(this.centerPos.x)} Y:${Math.floor(this.centerPos.y)} Z:${Math.floor(this.centerPos.z)}`, '📍');
      }
    }

    // 监听到达目标
    this.onGoalReachedBound = () => {
      this.isMoving = false;
      if (this.log && this.active) {
        this.log('info', `巡逻到达目标点`, '📍');
      }
    };
    this.bot.on('goal_reached', this.onGoalReachedBound);

    // 监听路径停止（包括无法到达的情况）
    this.onPathStopBound = () => {
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

  doMove() {
    if (!this.active || !this.bot?.entity || this.isMoving) return;
    if (!this.centerPos) return;

    this.isMoving = true;

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
