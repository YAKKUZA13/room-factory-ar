import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindCanvasViewport } from '../../src/ar/canvas-viewport';

afterEach(() => vi.unstubAllGlobals());
describe('AR canvas viewport', () => {
  it('sizes the actual drawing buffer before XR8 starts, follows rotation and releases listeners', () => {
    const listeners = new Map<string, () => void>();
    const host = {clientWidth:390,clientHeight:664};
    const disconnect=vi.fn();
    let onResize=()=>{};
    vi.stubGlobal('ResizeObserver', class {
      constructor(resize:()=>void){onResize=resize;}
      observe=vi.fn();disconnect=disconnect;
    });
    const remove=vi.fn();
    vi.stubGlobal('window',{devicePixelRatio:3,innerWidth:390,innerHeight:664,
      addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener:remove});
    const canvas={parentElement:host,width:300,height:150,style:{setProperty:vi.fn()}};
    const release=bindCanvasViewport(canvas as unknown as HTMLCanvasElement);
    expect([canvas.width,canvas.height]).toEqual([585,996]);
    host.clientWidth=844;host.clientHeight=390;onResize();
    expect([canvas.width,canvas.height]).toEqual([1266,585]);
    expect(canvas.style.setProperty).toHaveBeenCalledWith('width','844px','important');
    expect(listeners.has('resize')).toBe(true);
    release();expect(disconnect).toHaveBeenCalledOnce();expect(remove).toHaveBeenCalledOnce();
  });
});
