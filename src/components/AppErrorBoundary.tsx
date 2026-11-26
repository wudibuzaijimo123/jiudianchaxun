import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 全局错误边界。
 *
 * 地图（Leaflet）在坐标异常时会同步抛错，没有边界的话 React 会卸载整棵树，
 * 用户看到的就是「整页空白 / 像自己退了」。有了它，至少能留住框架并提示刷新。
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // 控制台留痕，方便排查；不向外抛出，避免 dev overlay 遮住页面
    console.error('[AppErrorBoundary]', error);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="app-crash-fallback">
        <h1>页面出了点问题</h1>
        <p>刚才这一步没走通，刷新一下就能继续用。你之前保存的搜索和收藏不会丢。</p>
        <pre>{error.message}</pre>
        <div className="app-crash-actions">
          <button type="button" onClick={this.handleReload}>
            重新加载
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => this.setState({ error: null })}
          >
            继续使用
          </button>
        </div>
      </div>
    );
  }
}
