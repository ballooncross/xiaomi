export interface Exercise {
  id: string;
  name: string;
  muscle: string;
  equipment: string;
  description: string;
  gifUrl: string;
}

export const exercises: Exercise[] = [
  {
    id: 'bench-press',
    name: '杠铃卧推 Bench Press',
    muscle: '胸肌 Chest',
    equipment: '杠铃、卧推架',
    description: '平躺在卧推凳上，双手握杠铃与肩同宽，下放至胸部后推起至手臂伸直。',
    gifUrl: 'https://media.musclewiki.com/media/uploads/videos/branded/male-barbell-bench-press-front.gif'
  },
  {
    id: 'squat',
    name: '杠铃深蹲 Barbell Squat',
    muscle: '腿部 Legs',
    equipment: '杠铃、深蹲架',
    description: '杠铃置于斜方肌上方，双脚与肩同宽，屈膝下蹲至大腿平行地面后站起。',
    gifUrl: 'https://media.musclewiki.com/media/uploads/videos/branded/male-barbell-squat-front.gif'
  },
  {
    id: 'deadlift',
    name: '硬拉 Deadlift',
    muscle: '背部 Back',
    equipment: '杠铃',
    description: '双脚与肩同宽站立，俯身握杠铃，保持背部挺直，用臀部和腿部力量将杠铃提起至站直。',
    gifUrl: 'https://media.musclewiki.com/media/uploads/videos/branded/male-barbell-deadlift-front.gif'
  },
  {
    id: 'overhead-press',
    name: '肩上推举 Overhead Press',
    muscle: '肩部 Shoulders',
    equipment: '杠铃',
    description: '站立握杠铃于锁骨前方，将杠铃推举过头顶至手臂伸直，再缓慢下放。',
    gifUrl: 'https://media.musclewiki.com/media/uploads/videos/branded/male-barbell-overhead-press-front.gif'
  },
  {
    id: 'barbell-row',
    name: '杠铃划船 Barbell Row',
    muscle: '背部 Back',
    equipment: '杠铃',
    description: '俯身约45度，双手握杠铃，将杠铃拉向下腹部，挤压背部后缓慢放下。',
    gifUrl: 'https://media.musclewiki.com/media/uploads/videos/branded/male-barbell-bent-over-row-front.gif'
  },
  {
    id: 'dumbbell-curl',
    name: '哑铃弯举 Dumbbell Curl',
    muscle: '手臂 Arms',
    equipment: '哑铃',
    description: '站立双手各持哑铃，上臂固定，前臂弯举哑铃至肩部高度后缓慢放下。',
    gifUrl: 'https://media.musclewiki.com/media/uploads/videos/branded/male-dumbbell-bicep-curl-front.gif'
  },
  {
    id: 'lat-pulldown',
    name: '高位下拉 Lat Pulldown',
    muscle: '背部 Back',
    equipment: '下拉器械',
    description: '坐于下拉机前，双手宽握把手，将把手拉至胸前，挤压背阔肌后缓慢回放。',
    gifUrl: 'https://media.musclewiki.com/media/uploads/videos/branded/male-cable-lat-pulldown-front.gif'
  },
  {
    id: 'leg-press',
    name: '腿举 Leg Press',
    muscle: '腿部 Legs',
    equipment: '腿举机',
    description: '坐于腿举机上，双脚置于踏板与肩同宽，推动踏板至腿部几乎伸直后缓慢回放。',
    gifUrl: 'https://media.musclewiki.com/media/uploads/videos/branded/male-machine-leg-press-side.gif'
  },
  {
    id: 'tricep-pushdown',
    name: '三头下压 Tricep Pushdown',
    muscle: '手臂 Arms',
    equipment: '绳索机',
    description: '面对绳索机，双手握把手于胸前，上臂固定，向下推至手臂伸直后缓慢回放。',
    gifUrl: 'https://media.musclewiki.com/media/uploads/videos/branded/male-cable-pushdown-front.gif'
  },
  {
    id: 'dumbbell-lateral-raise',
    name: '哑铃侧平举 Lateral Raise',
    muscle: '肩部 Shoulders',
    equipment: '哑铃',
    description: '站立双手各持哑铃于体侧，手臂微屈，向两侧抬起至与肩平行后缓慢放下。',
    gifUrl: 'https://media.musclewiki.com/media/uploads/videos/branded/male-dumbbell-lateral-raise-front.gif'
  },
  {
    id: 'cable-fly',
    name: '绳索夹胸 Cable Fly',
    muscle: '胸肌 Chest',
    equipment: '绳索机',
    description: '站于两根绳索之间，双手各握一个把手，手臂微屈向前合拢至胸前，挤压胸肌后缓慢回放。',
    gifUrl: 'https://media.musclewiki.com/media/uploads/videos/branded/male-cable-fly-front.gif'
  },
  {
    id: 'plank',
    name: '平板支撑 Plank',
    muscle: '核心 Core',
    equipment: '无器械',
    description: '前臂和脚尖着地，身体保持一条直线，收紧核心肌群，保持姿势不动。',
    gifUrl: 'https://media.musclewiki.com/media/uploads/videos/branded/male-bodyweight-front-plank-side.gif'
  },
  {
    id: 'pull-up',
    name: '引体向上 Pull Up',
    muscle: '背部 Back',
    equipment: '单杠',
    description: '双手正握单杠略宽于肩，从悬垂位置拉起身体至下巴过杠后缓慢放下。',
    gifUrl: 'https://media.musclewiki.com/media/uploads/videos/branded/male-bodyweight-pullup-front.gif'
  },
  {
    id: 'leg-curl',
    name: '腿弯举 Leg Curl',
    muscle: '腿部 Legs',
    equipment: '腿弯举机',
    description: '俯卧于腿弯举机上，脚踝钩住垫子，弯曲膝盖将垫子拉向臀部后缓慢回放。',
    gifUrl: 'https://media.musclewiki.com/media/uploads/videos/branded/male-machine-lying-leg-curl-side.gif'
  },
  {
    id: 'dumbbell-fly',
    name: '哑铃飞鸟 Dumbbell Fly',
    muscle: '胸肌 Chest',
    equipment: '哑铃、平板凳',
    description: '仰卧于平板凳上，双手各持哑铃于胸上方，手臂微屈向两侧打开后合拢回起始位。',
    gifUrl: 'https://media.musclewiki.com/media/uploads/videos/branded/male-dumbbell-fly-front.gif'
  },
  {
    id: 'calf-raise',
    name: '提踵 Calf Raise',
    muscle: '腿部 Legs',
    equipment: '提踵机或台阶',
    description: '站于台阶边缘，前脚掌着地，脚跟悬空，用小腿力量抬起脚跟至最高点后缓慢放下。',
    gifUrl: 'https://media.musclewiki.com/media/uploads/videos/branded/male-machine-standing-calf-raise-side.gif'
  }
];
