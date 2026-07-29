export default {
  pages: [
    'pages/home/index',
    'pages/recommend/index',
    'pages/benchmark/index',
    'pages/mine/index',
  ],
  subPackages: [
    {
      root: 'pages/workbench',
      pages: [
        'text/index',
        'image/index',
        'video-text/index',
        'video-image-first/index',
        'video-image-first-last/index',
        'video-edit/index',
        'video-extend/index',
        'works/index',
        'work-detail/index',
      ],
    },
    {
      root: 'pages/asset',
      pages: ['index', 'avatar-groups/index', 'avatar-group-create/index'],
    },
    {
      root: 'pages/billing',
      pages: ['subscribe/index', 'my-package/index', 'transactions/index', 'orders/index'],
    },
    {
      root: 'pages/settings',
      pages: ['index', 'about/index', 'privacy/index', 'user-agreement/index'],
    },
    {
      root: 'pages/template',
      pages: ['gallery/index', 'detail/index', 'my-templates/index'],
    },
  ],
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#0A0B1A',
    navigationBarTitleText: 'ReelClone',
    navigationBarTextStyle: 'white',
    backgroundColor: '#0A0B1A',
  },
  tabBar: {
    color: '#666680',
    selectedColor: '#7C3AED',
    backgroundColor: '#0A0B1A',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '推荐',
        iconPath: 'assets/tab/home.png',
        selectedIconPath: 'assets/tab/home-active.png',
      },
      {
        pagePath: 'pages/recommend/index',
        text: '广场',
        iconPath: 'assets/tab/square.png',
        selectedIconPath: 'assets/tab/square-active.png',
      },
      {
        pagePath: 'pages/benchmark/index',
        text: '对标',
        iconPath: 'assets/tab/benchmark.png',
        selectedIconPath: 'assets/tab/benchmark-active.png',
      },
      {
        pagePath: 'pages/mine/index',
        text: '我的',
        iconPath: 'assets/tab/mine.png',
        selectedIconPath: 'assets/tab/mine-active.png',
      },
    ],
  },
  preloadRule: {
    'pages/home/index': {
      network: 'all',
      packages: ['pages/workbench'],
    },
    'pages/mine/index': {
      network: 'all',
      packages: ['pages/asset', 'pages/billing'],
    },
  },
  darkmode: true,
  themeLocation: 'theme.json',
  networkTimeout: {
    request: 30000,
    connectSocket: 30000,
    uploadFile: 60000,
    downloadFile: 60000,
  },
  permission: {
    'scope.userInfo': {
      desc: '用于完善您的账户资料与展示头像昵称',
    },
  },
};
