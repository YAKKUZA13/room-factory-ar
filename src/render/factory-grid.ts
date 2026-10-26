import * as THREE from 'three';
import { GRID_HEIGHT, GRID_WIDTH, PALETTE } from '../core/constants';

export class FactoryGrid {
  readonly group = new THREE.Group();
  readonly raycastPlane: THREE.Mesh;
  private readonly gridLines: THREE.LineSegments;
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];

  constructor() {
    this.group.name = 'factory-grid';

    const plateGeometry = new THREE.BoxGeometry(GRID_WIDTH, 0.08, GRID_HEIGHT);
    const plateMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.amber,
      roughness: 0.62,
      metalness: 0.18,
    });
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.y = -0.04;
    plate.receiveShadow = false;
    this.group.add(plate);
    this.ownedGeometries.push(plateGeometry);
    this.ownedMaterials.push(plateMaterial);

    // Dark PCB edge frame.
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.graphite,
      roughness: 0.7,
      metalness: 0.3,
    });
    this.ownedMaterials.push(frameMaterial);
    const edges: Array<[number, number, number, number]> = [
      [0, -GRID_HEIGHT / 2, GRID_WIDTH + 0.12, 0.1],
      [0, GRID_HEIGHT / 2, GRID_WIDTH + 0.12, 0.1],
      [-GRID_WIDTH / 2, 0, 0.1, GRID_HEIGHT + 0.12],
      [GRID_WIDTH / 2, 0, 0.1, GRID_HEIGHT + 0.12],
    ];
    for (const [x, z, width, depth] of edges) {
      const geometry = new THREE.BoxGeometry(width, 0.11, depth);
      const edge = new THREE.Mesh(geometry, frameMaterial);
      edge.position.set(x, 0.005, z);
      this.group.add(edge);
      this.ownedGeometries.push(geometry);
    }

    // Metal corner screws.
    const screwMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.metal,
      roughness: 0.35,
      metalness: 0.65,
    });
    this.ownedMaterials.push(screwMaterial);
    const screwGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 12);
    this.ownedGeometries.push(screwGeometry);
    for (const [x, z] of [
      [-4.72, -4.72],
      [4.72, -4.72],
      [-4.72, 4.72],
      [4.72, 4.72],
    ] as Array<[number, number]>) {
      const screw = new THREE.Mesh(screwGeometry, screwMaterial);
      screw.position.set(x, 0.02, z);
      this.group.add(screw);
    }

    // Thin teal grid lines. Hidden in "view" mode by the menu toggle.
    const points: number[] = [];
    for (let i = 0; i <= GRID_WIDTH; i += 1) {
      const coordinate = -GRID_WIDTH / 2 + i;
      points.push(coordinate, 0.012, -GRID_HEIGHT / 2, coordinate, 0.012, GRID_HEIGHT / 2);
    }
    for (let i = 0; i <= GRID_HEIGHT; i += 1) {
      const coordinate = -GRID_HEIGHT / 2 + i;
      points.push(-GRID_WIDTH / 2, 0.012, coordinate, GRID_WIDTH / 2, 0.012, coordinate);
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const lineMaterial = new THREE.LineBasicMaterial({
      color: PALETTE.teal,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    this.gridLines = new THREE.LineSegments(lineGeometry, lineMaterial);
    this.gridLines.name = 'factory-grid-lines';
    this.group.add(this.gridLines);
    this.ownedGeometries.push(lineGeometry);
    this.ownedMaterials.push(lineMaterial);

    const planeGeometry = new THREE.PlaneGeometry(GRID_WIDTH, GRID_HEIGHT);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
      side: THREE.DoubleSide,
    });
    this.raycastPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    this.raycastPlane.name = 'factory-grid-raycast-plane';
    this.raycastPlane.rotation.x = -Math.PI / 2;
    this.raycastPlane.position.y = 0.011;
    this.group.add(this.raycastPlane);
    this.ownedGeometries.push(planeGeometry);
    this.ownedMaterials.push(planeMaterial);
  }

  setGridVisible(visible: boolean): void {
    this.gridLines.visible = visible;
  }

  dispose(): void {
    this.group.clear();
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
  }
}
