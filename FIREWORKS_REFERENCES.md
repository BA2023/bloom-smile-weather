# 烟花物理参考与改造

当前版本：Gemini 的标准灵敏度保留原始表情阈值，调节灵敏度时进入和退出阈值会按比例变化；原平滑系数与发射冷却不变。以下各版本段落记录当时实现，历史描述不代表当前设置。

## Gemini 烟花运动适配（gemini-physics-92）

按用户要求，正式 Gemini 引擎通过 `gemini-firework-motion.js` 复用 GPT 的 `firework-physics.js` 解析积分、顶点求解、球面采样和深度投影，不引入第三方物理库。运动适配保留 Gemini 的固定 60Hz 更新、粒子配色、圆形亮核和分层结构，同时调整升空减速、扩散惯性、重力下坠与碰撞耗能。近景火星最多 32 个，在近裁面前淡出；简化特效清空近景层。预演也完整播放升空后爆开，移除了直接预填爆炸画面的做法。

原始粒子池的默认配置仅用于冻结参考对照；正式 `GeminiParticleEngine` 始终启用新的烟花运动适配。参考对照仍验证原始基础代码，新增测试分别验证正式模式的顶点命中、重力与阻力轨迹、碰撞耗能、近景数量和生命周期。Gemini 雨效、头部拟合与表情识别未更改。

研究与实现日期：2026-10-31。保留BLOOM的本机表情识别、二维头部碰撞、9:16直播间、居中布局及手机入口，重写烟花运动与近景渲染。

## 查看的主参考

1. [Caleb Miller：Firework Simulator v2](https://codepen.io/MillerTime/pen/XgpNwb)。参考球面方向采样、主燃烧粒子与短寿命火星分离、阻力/重力与运动线段拖尾。源码中的Star指燃烧粒子，不代表星形图案。原作授权未在该页面确认，本项目未直接复制其代码，也未把镜像仓库的MIT许可当作原作许可。
2. [Jason Slay：fireworks](https://github.com/jasonslay/fireworks)，[MIT License](https://github.com/jasonslay/fireworks/blob/main/LICENSE)。查看了[升空与顶点爆炸](https://github.com/jasonslay/fireworks/blob/main/src/main.rs#L1804)、[球面采样](https://github.com/jasonslay/fireworks/blob/main/src/main.rs#L1868)、[粒子更新](https://github.com/jasonslay/fireworks/blob/main/src/main.rs#L2762)、[燃烧颜色](https://github.com/jasonslay/fireworks/blob/main/src/main.rs#L3040)及[径向粒子纹理](https://github.com/jasonslay/fireworks/blob/main/src/main.rs#L1422)。该项目使用二维正交渲染，将球面方向投到平面；没有把它描述成真实透视相机。

## 对旧实现的分析

旧版升空使用固定时长缓动；爆开时三份相近的二维圆环粒子叠加，容易形成整齐放射线和白色亮团。近景层按寿命推进透视比例，再绘制十字星芒，因此接近镜头时变成了放大的星星。拖尾在碰撞修正前采样，也会留下穿入头部的折线；低帧率下0.034秒的时间截断让动画变慢。

## 本项目的原创实现

- **运动**：以120Hz固定步长推进，线性阻力和恒定加速度采用解析积分。升空初速度由目标高度和顶点条件求解；跨过顶点的一步仍在准确顶点爆开。每枚火箭保存自身重力，缩放画面时同步迁移速度、风与伴生事件坐标。
- **主花**：均匀球面方向投影到二维，形成有内部疏密的球壳；加入不同速度、阻力和燃烧寿命。它仍是适合移动端的二维AR粒子层，不宣称完整三维刚体或流体模拟。
- **火星与燃尽**：燃烧粒子沿路径释放短寿命、不会递归发射的子火星；颜色逐步从亮色过渡到暖橙余烬，亮度连续衰减。20点历史以60Hz采样，前端线芯保持清楚，尾端渐淡。
- **碰撞**：保留连续椭圆求交，降低反弹系数，碰撞后停止喷出子火星并加快熄灭。只记录修正后的位置；头部移动包住粒子时清除旧轨迹，避免瞬移长线。
- **近镜头层**：独立的xyz初速度先受阻力和重力影响，再按f/(f-z)投影。屏幕上的加速来自透视。使用有方向的胶囊光迹、小圆亮核和有限柔光；取消十字及星形粒子，线长上限90px、亮核半径上限1.3px，在近裁面前淡出。此层是BLOOM新增实现，并非直接移植参考项目。
- **预算**：主粒子池上限与低帧率降级保留；近景火星最多48个。按实际存在的颜色和燃烧阶段批量绘制，减少空绘制；轻量模式关闭近景层及额外柔光。

## 验证证据

- `npm test`：17项通过，覆盖30/60/120FPS数值轨迹、无阻力与极小阻力、顶点命中、终端速度、球面分布、燃尽和近裁面。
- 浏览器完整引擎相同种子检查：30/60/120FPS的粒子位置、寿命与轨迹历史一致。
- 低预算压力：主池最多450/450、近景最多48/48，未出现非有限状态。
- 调整舞台尺寸后，顶点命中误差约2.84e-14 CSS像素，伴生事件位置同步缩放。
- 固定时刻、近景层及完整升空/燃尽播放均做浏览器检查。真人摄像头和真实手机性能仍需真机验收。

临时对照页与截图保存在本地被忽略的qa目录，正式部署不包含旧版本引擎或对照页面。

## 历史：Gemini / AuraFX参考整合（effect-modes-34）

- 来源：用户本机“字节tt笔试- Gemini/app.js”，按用户要求接入，无新增外部渲染或物理依赖。
- 原始app.js SHA-256：5a6d1539013a83780e1c420fa200220ae7247be2f411cb2bee25ef683fba2e1c。
- src/gemini-particles.js移植原粒子池、银蓝雨滴与水花、三圈径向彩色烟花、短拖尾和圆形余烬；绘制在现有Canvas上，共用既有相机与UI。未移植参考中的固定性能数字或“零分配”收益声明。
- 适配：按360逻辑宽度缩放，固定60Hz模拟，沿用连续椭圆碰撞避免快速雨滴穿透；保留750上限并支持450自动降级、轻量模式、排队上限及画布清理。
- src/gemini-expression.js采用0.32微笑进入、0.25退出、0.52笑容与0.30张口的大笑门控（标准灵敏度），340ms持续大笑连发（轻量模式为900ms）；加入中性初始化、短暂信号确认和丢脸归零。脸颊眯眼平均值乘0.24对应原代码两侧和乘0.12。平滑使用43ms时间常数而非按显示帧累积。
- 选择Gemini时Worker采样目标间隔45ms，主线程回退100ms，仍保持单帧在途；这不是实际设备推理帧率承诺。BLOOM恢复原75/130ms间隔和原表情门控。
- 45项Node测试通过；真实相机端到端灵敏度仍需用户在设备上验证，AI场景依然只是脚本演示。

## 历史：完整迁移对照（gemini-complete-35）

| 原版部分 | 当前实现 |
| --- | --- |
| ZeroGCParticlePool全部五类发射与render | src/gemini-particles.js中的GeminiParticlePool |
| SpatialHeadCollider人像、网格、皇冠、冲击波及动量滤波 | src/gemini-collider.js中的GeminiHeadCollider，完整绘制方法保留 |
| 四特征点拟合 | geminiHeadEllipse，使用相同cover/镜像映射 |
| ExpressionStateMachine | GeminiExpressionState.advance，60Hz时EMA=.32、原门控与340ms冷却 |
| 雨量、自动单发、预演双发、齐放三发、开场预热、点按发射 | GeminiParticleEngine固定步进控制器 |
| renderBackgroundLayer | drawBackground；沿用原渐变、情绪暗角、28%压暗，视频共用现有DOM层 |

当前不再使用上一轮的简化光环、双发自动烟花、较低雨量或归一化360宽度：普通模式使用原生CSS像素及原版参数。随机配色为原默认，固定配色作为保留的产品选项。新预演控制和halo开关接入现有设置，BLOOM不改变。

对照基准位于tests/fixtures/gemini-reference.js，是用户源文件效果类的冻结摘录；非原版应用启动代码，不会额外申请摄像头或网络。6项测试直接比较运动状态、渲染命令、碰撞、拟合、门控和发射数；总52项通过。

集成差异：按60Hz固定tick避免设备刷新率改变速度；真实输入从中性初始化且无脸归零；接触点正常情况保留原版反射/寿命/轨迹，连续碰撞仅兜底高速穿透；修正满池爆炸释放顺序，保留450预算和轻量保护。现有MediaPipe本地Worker与权限取消流程复用，不移入参考应用的演示FPS夹紧或“零GC”等收益宣称。真实硬件端到端效果仍待实测。


## 当前：原版Gemini识别（gemini-recognition-36）

用户要求识别逻辑完整迁移，以上34/35识别适配已被本节替代。原始app.js哈希不变。

| 原版 | 当前文件/行为 |
| --- | --- |
| @mediapipe/tasks-vision 0.10.14，GPU默认置信度 | src/gemini-recognition.js，public/vendor/gemini/独立锁定SDK/WASM；共享同一个官方float16 v1模型 |
| 640×480 ideal，30fps ideal，user camera，无音频 | GEMINI_CAMERA_CONSTRAINTS；切换在同一视频轨道applyConstraints |
| 45ms直接detectForVideo(video,now) | GeminiRecognizer.sample，无Worker、512px缩小或currentTime去重 |
| 五个blendshape分类、四点头部 | 原提取公式与10/152/234/454点；geminiHeadEllipse保留原拟合 |
| raw .78/.56，EMA .72/.52，alpha .32，初态fireworks | GeminiExpressionStateMachine原类逐段复制；每个显示帧更新一次 |
| 原迟滞、严格>340ms连续烟花 | 原状态机保留，未做持续确认/灵敏度缩放/重新武装 |
| 无脸时不覆盖上一系数与头部 | extractGeminiSignal保留，无BLOOM 550ms超时清理 |

Gemini的灵敏度控件隐藏，BLOOM滑杆值保留。粒子物理仍固定60Hz，轻量模式仅减少发射；页面隐藏、离开、取消和迟到模型释放仍按BLOOM产品生命周期执行。GPU不可用会显示识别错误并允许重试，不假称使用原版GPU成功，也不静默替换为BLOOM。

59项测试通过，其中6项冻结原代码对照，新增8项识别与生命周期测试。Chrome对项目内虚构AI视频实际运行0.10.14 GPU模型，52/52次检测有人脸，最后关闭模型。首帧推理约6.46秒预热，后续采样耗时见qa/recognition36-gpu.json，不承诺端到端延迟；该视频张口值未稳定越过.30，状态列表包含原始预填初态，不作为真人大笑识别成功证据。真实摄像头、不同光照和手机GPU仍待实测。


## GPT 模拟头像共用（gemini-avatar-51）

GPT（内部 BLOOM 引擎）的特效预演直接复用 `GeminiHeadCollider.renderColliderMesh`，包括玻璃人像、五官、肩颈、网格与头顶轮廓。原有 GPT 椭圆位置和尺寸直接供绘制使用；真实粒子碰撞点与存续时间仅适配为同款光弧，不引入 Gemini 的物理或识别状态机。

头像表情使用中性、细雨、烟花三种预设姿态，属于预演画面，不作为表情识别参数。真实镜头与 AI 主播画面不绘制此模拟头像。测试以原版 Gemini 绘制命令逐项对照三种姿态及碰撞光弧，并验证相机/AI画面的模拟头像绘制门控。
