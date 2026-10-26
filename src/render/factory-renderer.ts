import * as THREE from 'three';
import { LEVEL_HEIGHT, PALETTE } from '../core/constants';
import { getEnergyStats } from '../core/economy';
import { cellCenterLocal } from '../core/grid';
import type { FactoryState, GridPoint, BuildingType, Direction } from '../core/types';
import type { RigidPose } from '../ar/tracking-port';
import { applyPoseToObject } from '../ar/transforms';
import { BuildingVisual, createVisualMaterials, disposeVisualMaterials, type VisualMaterials } from './building-factory';
import { FactoryGrid } from './factory-grid';
import { localPointOnPlane, makeRay, projectToScreen } from './picking';

export interface FactoryRendererContract {
  attach(scene: THREE.Scene): void;
  updateFactory(state: Readonly<FactoryState>): void;
  updateVisuals(alpha: number, elapsedSeconds: number): void;
  setWorldPose(pose: RigidPose | null): void;
  setPlacementPreview(pose: RigidPose | null, allowed: boolean): void;
  pickCell(clientX: number, clientY: number, camera: THREE.Camera, viewport: DOMRect): GridPoint | null;
  pickBuilding(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    viewport: DOMRect,
  ): string | null;
  dispose(): void;
}

const HOVER_COLOR = 0x238b9b;
const INVALID_COLOR = 0xd75f46;

export class FactoryRenderer implements FactoryRendererContract {
  readonly root = new THREE.Group();
  private readonly content = new THREE.Group();
  private readonly buildingsRoot = new THREE.Group();
  private readonly previewRoot = new THREE.Group();
  private readonly previewContent = new THREE.Group();
  private readonly previewMaterial: THREE.MeshBasicMaterial;
  private readonly previewOutline: THREE.LineSegments;
  private readonly hoverMesh: THREE.Mesh;
  private readonly hoverMaterial: THREE.MeshBasicMaterial;
  private readonly ghostBox: THREE.Mesh;
  private readonly ghostEdges: THREE.LineSegments;
  private readonly ghostMaterial: THREE.MeshBasicMaterial;
  private readonly ghostEdgeMaterial: THREE.LineBasicMaterial;
  private readonly selectionLine: THREE.Line;
  private readonly markerDebug = new THREE.Group();
  private readonly markerDebugMaterials: THREE.Material[] = [];
  private readonly markerDebugGeometries: THREE.BufferGeometry[] = [];
  private readonly materials: VisualMaterials;
  private readonly grid: FactoryGrid;
  private readonly visuals = new Map<string, BuildingVisual>();
  private readonly ownedLights: THREE.Light[] = [];
  private scene: THREE.Scene | null = null;
  private latestState: Readonly<FactoryState> | null = null;
  private brownout = false;
  private cellSize = 0.1;
  private selectedId: string | null = null;
  private reducedMotion = false;
  private activeLevel = 0;
  private overview = false;
  private readonly ghostArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.08, 0), 1.2, 0x202932, 0.3, 0.2);

  constructor() {
    this.root.name = 'factory-root';
    this.content.name = 'factory-content';
    this.buildingsRoot.name = 'factory-buildings';

    this.materials = createVisualMaterials();
    this.grid = new FactoryGrid();
    this.content.add(this.grid.group);
    this.content.add(this.buildingsRoot);

    // Hover cell highlight.
    const hoverGeometry = new THREE.PlaneGeometry(0.94, 0.94);
    this.hoverMaterial = new THREE.MeshBasicMaterial({
      color: HOVER_COLOR,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.hoverMesh = new THREE.Mesh(hoverGeometry, this.hoverMaterial);
    this.hoverMesh.rotation.x = -Math.PI / 2;
    this.hoverMesh.position.y = 0.02;
    this.hoverMesh.visible = false;
    this.content.add(this.hoverMesh);

    const ghostGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.ghostMaterial = new THREE.MeshBasicMaterial({
      color: HOVER_COLOR,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
    });
    this.ghostBox = new THREE.Mesh(ghostGeometry, this.ghostMaterial);
    this.ghostBox.visible = false;
    this.ghostBox.name = 'building-placement-ghost';
    const ghostEdgesGeometry = new THREE.EdgesGeometry(ghostGeometry);
    this.ghostEdgeMaterial = new THREE.LineBasicMaterial({
      color: HOVER_COLOR,
      transparent: true,
      opacity: 0.9,
    });
    this.ghostEdges = new THREE.LineSegments(ghostEdgesGeometry, this.ghostEdgeMaterial);
    this.ghostBox.add(this.ghostEdges);
    this.content.add(this.ghostBox);
    this.content.add(this.ghostArrow);
    this.ghostArrow.visible = false;

    // Selected building outline.
    const selectionPoints = [
      new THREE.Vector3(-0.47, 0.025, -0.47),
      new THREE.Vector3(0.47, 0.025, -0.47),
      new THREE.Vector3(0.47, 0.025, 0.47),
      new THREE.Vector3(-0.47, 0.025, 0.47),
      new THREE.Vector3(-0.47, 0.025, -0.47),
    ];
    const selectionGeometry = new THREE.BufferGeometry().setFromPoints(selectionPoints);
    const selectionMaterial = new THREE.LineBasicMaterial({
      color: PALETTE.light,
      transparent: true,
      opacity: 0.9,
    });
    this.selectionLine = new THREE.Line(selectionGeometry, selectionMaterial);
    this.selectionLine.visible = false;
    this.content.add(this.selectionLine);

    // DEBUG-only marker axes + wire cube, shown in AR diagnostics mode.
    const axes = new THREE.AxesHelper(0.14);
    const cubeGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const cubeMaterial = new THREE.MeshBasicMaterial({
      color: 0x33b6c9,
      wireframe: true,
      transparent: true,
      opacity: 0.95,
    });
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.y = 0.04;
    this.markerDebug.add(axes, cube);
    this.markerDebug.visible = false;
    this.markerDebug.name = 'marker-debug';
    this.markerDebugGeometries.push(cubeGeometry);
    this.markerDebugMaterials.push(cubeMaterial);
    axes.traverse((object) => {
      if (object instanceof THREE.LineSegments) {
        this.markerDebugGeometries.push(object.geometry);
        if (object.material instanceof THREE.Material) {
          this.markerDebugMaterials.push(object.material);
        }
      }
    });

    this.root.add(this.content);
    this.root.visible = false;

    // Ghost placement podium.
    this.previewMaterial = new THREE.MeshBasicMaterial({
      color: HOVER_COLOR,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ghostPlate = new THREE.Mesh(new THREE.BoxGeometry(10, 0.04, 10), this.previewMaterial);
    ghostPlate.position.y = 0.02;
    this.previewContent.add(ghostPlate);

    const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-5, 0.05, -5),
      new THREE.Vector3(5, 0.05, -5),
      new THREE.Vector3(5, 0.05, 5),
      new THREE.Vector3(-5, 0.05, 5),
      new THREE.Vector3(-5, 0.05, -5),
    ]);
    this.previewOutline = new THREE.LineSegments(
      outlineGeometry,
      new THREE.LineBasicMaterial({ color: HOVER_COLOR, transparent: true, opacity: 0.95 }),
    );
    this.previewContent.add(this.previewOutline);
    for (let i = 0; i <= 10; i += 1) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-5 + i, 0.05, -5),
          new THREE.Vector3(-5 + i, 0.05, 5),
        ]),
        new THREE.LineBasicMaterial({ color: HOVER_COLOR, transparent: true, opacity: 0.2 }),
      );
      this.previewContent.add(line);
      const cross = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-5, 0.05, -5 + i),
          new THREE.Vector3(5, 0.05, -5 + i),
        ]),
        new THREE.LineBasicMaterial({ color: HOVER_COLOR, transparent: true, opacity: 0.2 }),
      );
      this.previewContent.add(cross);
    }
    this.previewContent.scale.setScalar(this.cellSize);
    this.previewRoot.add(this.previewContent);
    this.previewRoot.visible = false;
  }

  attach(scene: THREE.Scene): void {
    if (this.scene === scene) return;
    if (this.scene) {
      this.scene.remove(this.root);
      this.scene.remove(this.previewRoot);
    }
    this.scene = scene;
    scene.add(this.root);
    scene.add(this.previewRoot);
    scene.add(this.markerDebug);
    this.ensureLights(scene);
  }

  setCellSize(cellSizeMeters: number): void {
    this.cellSize = cellSizeMeters;
    this.content.scale.setScalar(cellSizeMeters);
    this.previewContent.scale.setScalar(cellSizeMeters);
  }

  updateFactory(state: Readonly<FactoryState>): void {
    this.latestState = state;
    if (state.cellSizeMeters !== this.cellSize) this.setCellSize(state.cellSizeMeters);
    this.brownout = getEnergyStats(state).brownout;

    const seen = new Set<string>();
    for (const building of state.buildings) {
      seen.add(building.id);
      let visual = this.visuals.get(building.id);
      if (!visual) {
        visual = new BuildingVisual(building.type, this.materials);
        visual.group.userData.buildingId = building.id;
        visual.group.position.set(...this.cellPosition(building.x, building.z));
        visual.group.rotation.y = (building.rotation * Math.PI) / 2;
        this.visuals.set(building.id, visual);
        this.buildingsRoot.add(visual.group);
      } else {
        const local = cellCenterLocal(building.x, building.z);
        if (
          Math.abs(visual.group.position.x - local.x) > 1e-6 ||
          Math.abs(visual.group.position.z - local.z) > 1e-6
        ) {
          visual.group.position.set(local.x, 0, local.z);
        }
        const rotation = (building.rotation * Math.PI) / 2;
        if (Math.abs(visual.group.rotation.y - rotation) > 1e-6) {
          visual.group.rotation.y = rotation;
        }
      }
      visual.group.position.y = (building.level ?? 0) * LEVEL_HEIGHT;
      visual.group.visible = this.overview || (building.level ?? 0) === this.activeLevel;
    }

    for (const [id, visual] of this.visuals) {
      if (!seen.has(id)) {
        this.buildingsRoot.remove(visual.group);
        visual.dispose();
        this.visuals.delete(id);
      }
    }

    if (this.selectedId && !seen.has(this.selectedId)) {
      this.setSelectedBuilding(null);
    }
  }

  setActiveLevel(level: number, overview = false): void {
    this.activeLevel = level;
    this.overview = overview;
    this.grid.group.position.y = level * LEVEL_HEIGHT;
    this.grid.group.updateMatrixWorld(true);
    this.setHoverCell(null);
    this.setBuildingGhost(null, null, 0, false);
    if (this.latestState) this.updateFactory(this.latestState);
  }

  updateVisuals(_alpha: number, elapsedSeconds: number): void {
    const state = this.latestState;
    if (!state) return;
    for (const building of state.buildings) {
      const visual = this.visuals.get(building.id);
      visual?.update(building, elapsedSeconds, this.brownout, this.reducedMotion);
    }
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  setMarkerDebugPose(pose: RigidPose | null): void {
    if (!pose) {
      this.markerDebug.visible = false;
      return;
    }
    applyPoseToObject(this.markerDebug, pose);
    this.markerDebug.visible = true;
  }

  setWorldPose(pose: RigidPose | null): void {
    if (!pose) {
      this.root.visible = false;
      return;
    }
    applyPoseToObject(this.root, pose);
    this.root.visible = true;
  }

  setPlacementPreview(pose: RigidPose | null, allowed: boolean): void {
    if (!pose) {
      this.previewRoot.visible = false;
      return;
    }
    applyPoseToObject(this.previewRoot, pose);
    this.previewRoot.visible = true;
    const color = allowed ? HOVER_COLOR : INVALID_COLOR;
    this.previewMaterial.color.setHex(color);
    (this.previewOutline.material as THREE.LineBasicMaterial).color.setHex(color);
  }

  pickCell(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    viewport: DOMRect,
  ): GridPoint | null {
    const local = localPointOnPlane(
      camera,
      clientX,
      clientY,
      viewport,
      this.grid.raycastPlane,
      this.content,
    );
    if (!local) return null;
    const x = Math.floor(local.x + 5);
    const z = Math.floor(local.z + 5);
    if (x < 0 || x >= 10 || z < 0 || z >= 10) return null;
    return { x, z };
  }

  pickBuilding(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    viewport: DOMRect,
  ): string | null {
    if (this.visuals.size === 0) return null;
    const groups = Array.from(this.visuals.values(), (visual) => visual.group).filter(group => group.visible);
    const hits = makeRay(camera, clientX, clientY, viewport).intersectObjects(groups, true);
    for (const hit of hits) {
      let object: THREE.Object3D | null = hit.object;
      while (object) {
        const id = object.userData.buildingId;
        if (typeof id === 'string') return id;
        object = object.parent;
      }
    }
    return null;
  }

  /** Used by E2E/debug tools to click a known cell without guessing pixels. */
  getCellScreenPoint(
    x: number,
    z: number,
    camera: THREE.Camera,
    viewport: DOMRect,
  ): { x: number; y: number } | null {
    const local = cellCenterLocal(x, z);
    const point = new THREE.Vector3(local.x, this.activeLevel * LEVEL_HEIGHT + 0.02, local.z);
    this.content.localToWorld(point);
    const projected = projectToScreen(point, camera, viewport);
    return projected.inFront ? { x: projected.x, y: projected.y } : null;
  }

  setHoverCell(cell: GridPoint | null, valid = true): void {
    if (!cell) {
      this.hoverMesh.visible = false;
      this.ghostBox.visible = false;
      return;
    }
    const local = cellCenterLocal(cell.x, cell.z);
    this.hoverMesh.position.set(local.x, this.activeLevel * LEVEL_HEIGHT + 0.02, local.z);
    this.hoverMaterial.color.setHex(valid ? HOVER_COLOR : INVALID_COLOR);
    this.hoverMesh.visible = true;
  }

  setBuildingGhost(
    type: BuildingType | null,
    cell: GridPoint | null,
    rotation: Direction,
    allowed: boolean,
  ): void {
    if (!type || !cell) {
      this.ghostBox.visible = false;
      this.ghostArrow.visible = false;
      return;
    }
    const heights: Record<BuildingType, number> = {
      generator: 0.55,
      extractor: 0.65,
      conveyor: 0.22,
      processor: 0.95,
      lift: LEVEL_HEIGHT,
    };
    const height = heights[type];
    const local = cellCenterLocal(cell.x, cell.z);
    this.ghostBox.position.set(local.x, this.activeLevel * LEVEL_HEIGHT + height / 2, local.z);
    this.ghostArrow.position.set(local.x, this.activeLevel * LEVEL_HEIGHT + height + 0.1, local.z);
    this.ghostArrow.setDirection(new THREE.Vector3(Math.sin(rotation * Math.PI / 2), 0, Math.cos(rotation * Math.PI / 2)));
    this.ghostArrow.visible = true;
    this.ghostBox.scale.set(0.76, height, 0.76);
    this.ghostBox.rotation.y = (rotation * Math.PI) / 2;
    const color = allowed ? HOVER_COLOR : INVALID_COLOR;
    this.ghostMaterial.color.setHex(color);
    this.ghostEdgeMaterial.color.setHex(color);
    this.ghostBox.visible = true;
  }

  setSelectedBuilding(id: string | null): void {
    this.selectedId = id;
    if (!id) {
      this.selectionLine.visible = false;
      return;
    }
    const visual = this.visuals.get(id);
    if (!visual) {
      this.selectionLine.visible = false;
      return;
    }
    this.selectionLine.position.copy(visual.group.position);
    this.selectionLine.rotation.y = visual.group.rotation.y;
    this.selectionLine.visible = true;
  }

  flashSale(buildingId: string): void {
    this.visuals.get(buildingId)?.flashSale();
  }

  setGridVisible(visible: boolean): void {
    this.grid.setGridVisible(visible);
  }

  getStats(): { buildings: number; meshes: number } {
    let meshes = 0;
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes += 1;
    });
    return { buildings: this.visuals.size, meshes };
  }

  dispose(): void {
    for (const visual of this.visuals.values()) visual.dispose();
    this.visuals.clear();
    this.buildingsRoot.clear();
    this.grid.dispose();
    disposeVisualMaterials(this.materials);
    this.hoverMesh.geometry.dispose();
    this.hoverMaterial.dispose();
    this.ghostBox.geometry.dispose();
    this.ghostEdges.geometry.dispose();
    this.ghostMaterial.dispose();
    this.ghostEdgeMaterial.dispose();
    for (const geometry of this.markerDebugGeometries) geometry.dispose();
    for (const material of this.markerDebugMaterials) material.dispose();
    this.selectionLine.geometry.dispose();
    (this.selectionLine.material as THREE.Material).dispose();
    this.previewRoot.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) {
          for (const item of material) item.dispose();
        } else {
          material.dispose();
        }
      }
    });
    if (this.scene) {
      this.scene.remove(this.root);
      this.scene.remove(this.previewRoot);
      this.scene.remove(this.markerDebug);
      for (const light of this.ownedLights) {
        this.scene.remove(light);
        if (light instanceof THREE.DirectionalLight) this.scene.remove(light.target);
      }
    }
    this.ownedLights.length = 0;
    this.scene = null;
    this.root.clear();
    this.previewRoot.clear();
    this.previewContent.clear();
  }

  private cellPosition(x: number, z: number): [number, number, number] {
    const local = cellCenterLocal(x, z);
    return [local.x, 0, local.z];
  }

  private ensureLights(scene: THREE.Scene): void {
    const hasLight = scene.children.some((child) => (child as THREE.Light).isLight === true);
    if (hasLight) return;
    const hemisphere = new THREE.HemisphereLight(0xfff4dd, 0x2b3338, 1.6);
    hemisphere.position.set(0, 4, 0);
    const sun = new THREE.DirectionalLight(0xfff0cc, 2.1);
    sun.position.set(2.5, 4, 2.5);
    sun.castShadow = false;
    scene.add(hemisphere, sun);
    scene.add(sun.target);
    this.ownedLights.push(hemisphere, sun);
  }
}
