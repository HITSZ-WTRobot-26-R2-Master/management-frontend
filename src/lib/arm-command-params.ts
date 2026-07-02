export interface ArmCommandParamDef {
  fields: string[]
  defaults: Record<string, number>
  description: string
}

export const ARM_COMMAND_PARAMS: Record<string, ArmCommandParamDef> = {
  arm_take_top_prepare: {
    fields: ["x", "y"],
    defaults: { x: 0.3, y: 0.3 },
    description: "从上方接近卷轴，开启吸盘。x=卷轴X坐标(m), y=卷轴Y坐标(m)",
  },
  arm_take_top_do: {
    fields: ["x", "y"],
    defaults: { x: 0.3, y: 0.3 },
    description: "吸住卷轴后抬升。x/y 需与 prepare 一致",
  },
  arm_take_front: {
    fields: ["x", "y"],
    defaults: { x: 0.3, y: 0.3 },
    description: "从前方取卷轴（完整动作：接近+吸取+缩回）。x/y=卷轴坐标(m)",
  },
  arm_take_front_prepare: {
    fields: ["x", "y"],
    defaults: { x: 0.3, y: 0.3 },
    description: "从前方接近卷轴，开启吸盘。x/y 需与 do 一致",
  },
  arm_take_front_do: {
    fields: ["x", "y"],
    defaults: { x: 0.3, y: 0.3 },
    description: "吸住卷轴后缩回。x/y 需与 prepare 一致",
  },
  arm_place_direct: {
    fields: ["x", "y"],
    defaults: { x: 0.3, y: 0.3 },
    description: "直接将卷轴放置到置物架上。x=架X坐标(m), y=架层底面高度(m)",
  },
  arm_store_internal: {
    fields: ["length_to_bottom"],
    defaults: { length_to_bottom: 0.085 },
    description: "将已吸住的卷轴放入内部存储。length_to_bottom=吸盘到卷轴底面距离(m)",
  },
  arm_place_from_internal_prepare: {
    fields: [],
    defaults: {},
    description: "从内部存储取出卷轴（准备）。无需参数，自动执行预设路径",
  },
  arm_place_from_internal_do: {
    fields: ["x", "y"],
    defaults: { x: 0.3, y: 0.3 },
    description: "从内部存储取出卷轴并放置（执行）。x/y 需与 prepare 一致",
  },
  arm_back_to_idle: {
    fields: [],
    defaults: {},
    description: "返回空闲位置，关闭吸盘，不保留卷轴",
  },
  arm_back_to_idle_suck: {
    fields: [],
    defaults: {},
    description: "返回空闲位置，保持吸住卷轴",
  },
  arm_throw: {
    fields: [],
    defaults: {},
    description: "举到头顶扔掉卷轴。无需参数，自动执行预设路径",
  },
  arm_back_to_start: {
    fields: ["q1", "q2", "q3"],
    defaults: { q1: 90, q2: 35, q3: 55 },
    description: "返回指定关节角位置。q1/q2/q3=目标关节角(度)",
  },
  arm_release: {
    fields: [],
    defaults: {},
    description: "放开当前吸住的卷轴。关闭吸盘并等待气压恢复，无需参数",
  },
  arm_get_KFS_from_R1: {
    fields: ["x", "y"],
    defaults: { x: -0.3, y: 0.15 },
    description: "从车后获取R1卷轴。x=卷轴X坐标(m, 必须<0), y=卷轴Y坐标(m)",
  },
}

export const ARM_COMMAND_GROUPS: Array<{
  label: string
  commands: string[]
}> = [
  {
    label: "取卷轴 (Top Take)",
    commands: ["arm_take_top_prepare", "arm_take_top_do"],
  },
  {
    label: "取卷轴 (Front Take)",
    commands: ["arm_take_front", "arm_take_front_prepare", "arm_take_front_do"],
  },
  {
    label: "放置卷轴 (Place)",
    commands: ["arm_place_direct"],
  },
  {
    label: "内部存储 (Internal Store)",
    commands: ["arm_store_internal"],
  },
  {
    label: "从内部取出放置 (Store → Shelf)",
    commands: ["arm_place_from_internal_prepare", "arm_place_from_internal_do"],
  },
  {
    label: "空闲 (Idle)",
    commands: ["arm_back_to_idle", "arm_back_to_idle_suck"],
  },
  {
    label: "扔卷轴 (Throw)",
    commands: ["arm_throw"],
  },
  {
    label: "回归起点 (Back to Start)",
    commands: ["arm_back_to_start"],
  },
  {
    label: "放开卷轴 (Release)",
    commands: ["arm_release"],
  },
  {
    label: "取卷轴 (R1 Take)",
    commands: ["arm_get_KFS_from_R1"],
  },
]
