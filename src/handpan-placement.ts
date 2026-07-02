import {
  createSystem,
  Entity,
  Matrix4,
  Object3D,
  OneHandGrabbable,
  Quaternion,
  Vector3,
  XRAnchor,
} from "@iwsdk/core";

import { Handpan } from "./handpan.js";

const LOCK_CHANGED = "panflow-handpan-lock-changed";

function dispatchLockChanged(): void {
  window.dispatchEvent(new CustomEvent(LOCK_CHANGED, {
    detail: { locked: handpanPlacementManager.locked },
  }));
}

/**
 * Shared singleton for handpan place-and-lock.
 * Grab to position, then lock to pin the current world pose.
 */
export const handpanPlacementManager = {
  entity:      null as Entity | null,
  sceneParent: null as Entity | null,
  isArMode:    false,
  locked:      false,
  hasPin:      false,

  pinnedPosition:    new Vector3(),
  pinnedQuaternion:  new Quaternion(),

  lock(): boolean {
    const entity = this.entity;
    if (!entity?.object3D || this.locked) return this.locked;

    const obj = entity.object3D;
    obj.updateMatrixWorld();
    obj.getWorldPosition(this.pinnedPosition);
    obj.getWorldQuaternion(this.pinnedQuaternion);
    this.hasPin = true;

    entity.setValue(OneHandGrabbable, "translate", false);
    entity.setValue(OneHandGrabbable, "rotate",    false);

    if (this.isArMode && !entity.hasComponent(XRAnchor)) {
      entity.addComponent(XRAnchor);
    }

    this.locked = true;
    dispatchLockChanged();
    return this.locked;
  },

  unlock(): boolean {
    const entity = this.entity;
    if (!entity || !this.locked) return this.locked;

    const obj = entity.object3D;

    if (this.isArMode && entity.hasComponent(XRAnchor)) {
      if (obj && this.sceneParent?.object3D) {
        this.sceneParent.object3D.attach(obj);
      }
      entity.removeComponent(XRAnchor);
    }

    entity.setValue(OneHandGrabbable, "translate", true);
    entity.setValue(OneHandGrabbable, "rotate",    true);

    this.locked = false;
    this.hasPin = false;
    dispatchLockChanged();
    return this.locked;
  },

  toggle(): boolean {
    return this.locked ? this.unlock() : this.lock();
  },
};

export class HandpanPlacementSystem extends createSystem({
  handpans: { required: [Handpan] },
}) {
  private _pinMatrix!:  Matrix4;
  private _invParent!:  Matrix4;
  private _scratchScale!: Vector3;

  init() {
    this._pinMatrix    = new Matrix4();
    this._invParent    = new Matrix4();
    this._scratchScale = new Vector3();
  }

  update(_delta: number, _time: number) {
    const mgr = handpanPlacementManager;
    if (!mgr.locked || !mgr.hasPin) return;

    const entity = mgr.entity;
    const obj = entity?.object3D;
    if (!entity || !obj) return;

    if (mgr.isArMode && entity.hasComponent(XRAnchor)) {
      if (entity.getValue(XRAnchor, "attached")) return;
    }

    this._applyPinnedPose(obj, mgr.pinnedPosition, mgr.pinnedQuaternion);
  }

  private _applyPinnedPose(
    obj: Object3D,
    worldPos: Vector3,
    worldQuat: Quaternion,
  ): void {
    this._pinMatrix.compose(worldPos, worldQuat, obj.scale);

    const parent = obj.parent;
    if (parent) {
      parent.updateMatrixWorld();
      this._invParent.copy(parent.matrixWorld).invert();
      this._pinMatrix.premultiply(this._invParent);
    }

    this._pinMatrix.decompose(obj.position, obj.quaternion, this._scratchScale);
  }
}
