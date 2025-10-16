# 五子棋微信小游戏 - Cocos版

## 项目结构

```
client-cocos/
├── game.js                  # 游戏入口
├── game.json                # 游戏配置
├── project.config.json      # 项目配置
├── libs/
│   └── weapp-adapter.js     # 微信适配器
└── src/
    ├── api/
    │   └── HttpClient.js    # HTTP客户端
    ├── scenes/
    │   └── GameScene.js     # 游戏主场景
    └── utils/
        └── Config.js        # 配置文件（禁止硬编码）
```

## 使用说明

### 1. 导入项目

1. 打开微信开发者工具
2. 点击"小游戏"
3. 导入项目
4. 选择目录：`client-cocos`
5. AppID使用：`wx2bb9824ce01c868f`（或选择测试号）

### 2. 配置

修改 `src/utils/Config.js` 中的服务器地址（如果需要）

### 3. 运行

点击"编译"即可运行

## 当前功能

- ✅ 棋盘绘制
- ✅ 双人对战（本地）
- ✅ 胜负判断
- ⏳ 联网对战（待接入后端）

## 下一步

1. 接入后端API
2. 实现人机对战
3. 添加UI界面

