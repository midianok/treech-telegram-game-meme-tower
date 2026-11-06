import * as THREE from 'three';

import { CFG } from '../constants';

/** Изометрическая ортографическая камера: фрустум в CSS-пикселях, zoom = пикселей на единицу мира. */
export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 400);
  /** Куда камера плавно едет и к какому масштабу приближается. */
  readonly cameraGoal = CFG.cameraStart.clone();
  zoomGoal: number = CFG.zoom;

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    parent.appendChild(this.renderer.domElement);

    this.camera.position.copy(CFG.cameraStart);
    this.camera.lookAt(0, 0, 0); // ориентация фиксирована, дальше камера только сдвигается
    this.camera.zoom = CFG.zoom;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();
  }

  resetCamera(): void {
    this.camera.position.copy(CFG.cameraStart);
    this.cameraGoal.copy(CFG.cameraStart);
    this.camera.zoom = this.zoomGoal = CFG.zoom;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.camera.position.lerp(this.cameraGoal, Math.min(dt, 1));
    const zoom = this.camera.zoom + (this.zoomGoal - this.camera.zoom) * Math.min(dt * 4, 1);
    if (Math.abs(zoom - this.camera.zoom) > 1e-3) {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
