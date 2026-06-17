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
    fields: ["x", "y"],
    defaults: { x: 0.3, y: 0.3 },
    description: "从内部存储取出卷轴（准备）。x=架X坐标(m), y=架层底面高度(m)",
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
]
