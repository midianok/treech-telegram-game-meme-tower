import * as THREE from 'three';

import { CFG } from '../constants';
import type { Box } from '../entities/Box';

const DURATION = 0.5;

function createFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 90);
  g.addColorStop(0, 'rgba(255,255,255,0.0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Вспышка «идеально»: светлая рамка по верху коробки, которая расширяется и гаснет. */
export class PerfectFlash {
  private readonly texture = createFlashTexture();
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private t = 0;

  constructor(private readonly scene: THREE.Scene) {}

  show(box: Box): void {
    this.clear();
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(box.sx, box.sz),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.copy(box.mesh.position);
    this.mesh.position.y += CFG.boxHeight / 2 + 0.002;
    this.scene.add(this.mesh);
    this.t = 0;
  }

  update(dt: number): void {
    if (!this.mesh) return;
    this.t += dt / DURATION;
    const k = Math.min(this.t, 1);
    this.mesh.scale.setScalar(1 + 0.1 * k);
    this.mesh.material.opacity = 1 - k;
    if (k >= 1) this.clear();
  }

  clear(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh = null;
  }
}
