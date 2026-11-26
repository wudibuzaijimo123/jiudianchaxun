# 查询工具（酒店 · 租房 · 招聘周边查询）

一款响应式手机端 Web App / PWA 与 iOS 独立安装包工具（应用名：**查询工具**）。输入任意目标地点、高校校区、地铁站或使用当前定位，即可一键切换查询**周边酒店房价与空房、安居客/58/贝壳租房房源、周边在招岗位**，支持纯手机端侧独立运行或云服务器部署。

---

## ✨ 核心功能

- **高德 POI 2.0 周边雷达 + 火星坐标纠偏**：精准检索商圈及郊区/高校门口的连锁酒店、个体宾馆、公寓民宿、前台电话与高德间夜均价；内置 WGS-84 ↔ GCJ-02 转换，国内街道打点零偏移。
- **实时空房库存与分销比价（SerpApi）**：支持按入住/离店日期实时核查空房状态、多渠道（携程 Trip.com、Agoda、Booking 等）人民币报价，同时聚合国内抖音探店团购、小红书住客避坑笔记与携程/同程国内站收录信息（内置 25 分钟缓存保护免费额度）。
- **AI 全网自动搜价并打印上屏（兼容 OpenAI 接口）**：针对未在线上分销网挂牌的国内中小宾馆，自动结合公开检索摘要与同地段行情调用大模型提取每晚起步价、价格区间、大床/双床房型价目表、抖音团购参考价及避坑提醒，直接渲染到列表卡片正面、地图价格气泡和详情页。
- **双视图联动 & 手机端 PWA 安装**：电脑端左右分屏联动，手机端一键切换「列表浏览 / 地图打点」，支持局域网扫码同步配置并添加到 iOS / Android 主屏幕全屏运行。
- **租房房源（安居客式）**：顶部「住酒店 / 租房源」一键切换。租房模式下按整租、合租、单间、床位、日租、公寓分类筛选，卡片直出户型、面积、楼层、朝向、装修、月租、押付方式与距目标距离，点开可看配套与免责提示，并一键跳转安居客 / 58 同城 / 贝壳核验真实房源。

---

## 🚀 快速安装与启动

### 1. 环境要求
- 已安装 [Node.js](https://nodejs.org/)（版本 `>= 18`）

### 2. 下载并启动

```bash
# 克隆仓库
git clone git@github.com:wudibuzaijimo123/jiudianchaxun.git
cd jiudianchaxun

# 安装依赖
npm install

# 启动本地服务
npm run dev
```

- **Windows 一键启动**：安装依赖后，平时直接双击项目根目录的 `启动酒店查询服务.bat` 即可秒开服务并自动在浏览器打开 `http://localhost:5173`。
- **手机端同步使用**：电脑保持服务开启，手机连接同一 Wi-Fi，点击电脑页面右上角 **「手机扫码用」**，用手机相机或浏览器扫码即可自动同步配置打开；在 iPhone Safari 点「分享 → 添加到主屏幕」（或安卓浏览器点「安装应用」）即可变身独立桌面 App。

---

## 🔑 保姆级接口配置教程（零成本免费申请）

本项目源码**不包含任何硬编码密钥**。首次打开页面后，点击右上角 **「配置接口Key」** 按钮，按下方教程申请并粘贴你自己的密钥（所有 Key 仅保存在你本机浏览器的 `localStorage` 中，且默认密码遮罩防止截屏泄露）：

### 第一项：高德开放平台「Web服务」Key（强烈推荐 · 免费 5000 次/日）
> 作用：获取全国精确到街巷/校门口级的全部周边酒店、宾馆、民宿位置、距离、实景图、前台电话与高德均价。

1. 打开 [高德开放平台控制台 - 账号信息](https://console.amap.com/dev/user/info)，注册登录并完成**个人开发者实名认证**。
2. **⚠️ 新手防坑第 1 步（必看）**：在「账号信息」页面右下角查看「开发者信息 → 授权类型」。如果显示橙色的 `未获得技术服务使用许可`，请点击旁边的蓝色字 **「去开通」**，免费勾选同意个人学习/技术开发许可（0 元免费）。
3. 点击左侧菜单栏 **「应用管理 → 我的应用」**，点击右上角 **「创建新应用」**（应用名称随便填如 `周边查房`，类型任选）。
4. 在刚创建的应用右侧点击 **「+ 添加Key」**：
   - Key 名称：随便填（如 `web-service`）
   - **⚠️ 新手防坑第 2 步（必看）**：**服务平台务必勾选 `Web服务`**！（千万**不要**选成第一个 `Web端(JS API)`，否则周边检索接口会报 `10009` 类型不匹配错误）。
5. 提交后复制生成的 **32 位字母数字 Key**，粘贴到页面配置弹窗的第 1 栏。

---

### 第二项：SerpApi Key（选填推荐 · 免费 250 次/月 · 免绑信用卡）
> 作用：核查指定入住/离店日期的实时空房状态、细分房型在线报价，并检索国内抖音团购、小红书住客笔记与携程/同程公开网页摘要。

1. 打开 [SerpApi 注册页 (serpapi.com/users/sign_up)](https://serpapi.com/users/sign_up)，支持直接用 **GitHub / Google 账号一键登录**或邮箱注册。
2. 选择 **Free Plan（免费套餐，每月 250 次查询，无需绑定银行卡）**。
3. **⚠️ 关键激活步骤**：根据网页引导点击**验证邮件中的确认链接**，并完成**手机号短信验证码验证**（国内 `+86` 手机号可直接收验证码；未完成验证前 Key 无法调用）。
4. 验证通过后打开 [serpapi.com/manage-api-key](https://serpapi.com/manage-api-key)，复制页面上的 64 位 `Your Private API Key`，粘贴到项目配置弹窗的第 2 栏（项目后端已内置 25 分钟结果缓存，同一地点/酒店重复点击不会重复扣额度）。

---

### 第三项：AI 联网搜价与房型提纯大模型（推荐 · 兼容所有 OpenAI 格式接口）
> 作用：自动为周边未挂牌中小宾馆联网检索并核定每晚起步价、价格区间与主力房型价，直接打印在列表卡片和地图气泡上，并在详情页生成结构化房型价目表与避坑指南。

在配置弹窗第 3 栏中，可以直接点击 **「一键填平台参数」** 按钮自动填好 `Base URL` 和 `模型名`，你只需前往任一平台复制 `sk-...` 开头的 API Key 粘贴即可：

| 平台名称 | 特点说明 | API Key 申请地址 | Base URL 参数 | 推荐模型名 (Model) |
| :--- | :--- | :--- | :--- | :--- |
| **硅基流动 (SiliconFlow)** | **零成本首选**，注册实名即用，提供多款永久免费开源模型 | [cloud.siliconflow.cn/account/ak](https://cloud.siliconflow.cn/account/ak) | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct`（免费）或 `deepseek-ai/DeepSeek-V3` |
| **DeepSeek 官方** | 性价比高，JSON 提取与国内房价推理准 | [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) | `https://api.deepseek.com/v1` | `deepseek-chat` |
| **阿里云百炼 (通义千问)** | 新开通赠送免费 Token 额度，国内响应快 | [bailian.console.aliyun.com](https://bailian.console.aliyun.com/?apiKey=1) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` 或 `qwen-turbo` |
| **月之暗面 (Kimi)** | 兼容标准 OpenAI 格式 | [platform.moonshot.cn/console/api-keys](https://platform.moonshot.cn/console/api-keys) | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |

填好以上配置后，点击底部蓝色按钮 **「保存全部配置」** 即可立即生效！

---

## ❓ 常见问题排查 (FAQ)

1. **填了高德 Key 后顶部黄条提示 `10009 (USERKEY_PLAT_NOMATCH)`？**
   - 说明添加 Key 时选成了「Web端(JS API)」，请回到高德控制台「我的应用」新建一个勾选 **「Web服务」** 的 Key 替换即可。
2. **填了高德 Key 提示 `10012 / 10044` 权限不足？**
   - 请前往高德控制台「账号中心 → 账号信息」，点击「授权类型」旁的 **「去开通」** 免费激活个人技术服务许可。
3. **填了 SerpApi Key 提示 `not verified`？**
   - 请登录 `serpapi.com` 检查是否已点开邮箱激活邮件并完成了手机号短信验证。
4. **为什么郊区/村镇校门口个别家庭小旅馆只有电话没有实时在线库存？**
   - 村镇个体自营小旅馆通常未接入携程/Agoda等全球在线分销系统；配置第 3 项 AI 大模型后，系统会自动检索全网公开团购线索与同路段行情将参考房价打印到卡片上，同时卡片正面直接展示门店电话方便一键核实。

---

## 📱 手机端独立使用方案（云服务器部署 & iOS 原生 IPA 签名安装）

### 方案 A：iPhone 原生 `.ipa` 安装包（已配置 GitHub Actions 云端自动打包！）
仓库内置了 `.github/workflows/build-ios-ipa.yml`（基于 macOS Xcode + Capacitor 自动打包）：
1. 每次推送到 `main` 分支后，GitHub 会自动在云端编译生成最新的未签名 **`chaxun-tool-unsigned.ipa`**（已内置中文桌面应用名「查询工具」、`resources/icon.png` 全尺寸高清桌面图标、iOS 原生 GPS 定位权限及美团/抖音/高德/安居客/58/贝壳/BOSS直聘 App 唤醒白名单）。
2. 直接在手机或电脑打开仓库的 **[Releases 页面](https://github.com/wudibuzaijimo123/jiudianchaxun/releases)**，下载最新的 `chaxun-tool-unsigned.ipa`。
3. 使用你的 **IPA 证书签名工具（轻松签 / 全能签 / 巨魔 TrollStore / 牛蛙助手 / Sideloadly）** 对该 `.ipa` 签名并安装到 iPhone。
4. 安装后打开 App，无需额外部署服务器，在右上角填好高德 Web服务 Key 和大模型 Key 即可**纯手机端侧独立运行**（也可在第 4 栏选填你自己的云服务器地址开启完整代理检索）。

### 方案 B：部署到你自己的云服务器（24 小时在线，支持 iPhone 添加到主屏幕 / 给 IPA 供数）
项目已内置零外部依赖的生产服务端 `server.mjs` 与 `Dockerfile` / `docker-compose.yml`：

```bash
# 方式 1：Docker Compose 一键后台部署（推荐）
git clone git@github.com:wudibuzaijimo123/jiudianchaxun.git
cd jiudianchaxun
docker compose up -d --build

# 方式 2：Node.js 直接启动生产服务
npm install
npm run build
PORT=5173 npm start
```
部署完成后（建议配合 Nginx / Caddy 反代开启 `HTTPS`，以便手机浏览器使用室外 GPS 定位），手机浏览器直接访问你的服务器域名即可随时使用！

---

## 📦 构建生产静态包

```bash
npm run build
```
