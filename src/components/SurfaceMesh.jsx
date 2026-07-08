import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useConfigurator } from "../context/Configurator";

// Spacing of the sampling grid in the flattened 2D space (smaller = denser).
const GRID_SPACING = 0.02;
// Boundary points closer than this are treated as duplicates and merged.
const DUPLICATE_THRESHOLD = 0.01;
// Points are raycast back onto the head in chunks so generation never blocks
// the main thread / UI.
const BATCH_SIZE = 100;
// The head model is cloned and transformed to match the on-screen primitive
// before generated points are raycast back onto it.
const HEAD_SCALE = 20;
const HEAD_POSITION = new THREE.Vector3(0, -30, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// Build a clean, closed, non-redundant boundary loop from the drawn segments.
function extractBoundaryLoop(lineSegments) {
    const all = [];
    lineSegments.forEach((segment) => {
        segment.forEach((point) => all.push(point.clone()));
    });

    const loop = [];
    if (all.length > 0) loop.push(all[0].clone());
    for (let i = 1; i < all.length; i++) {
        if (loop[loop.length - 1].distanceTo(all[i]) > DUPLICATE_THRESHOLD) {
            loop.push(all[i].clone());
        }
    }

    // Ensure the loop is explicitly closed.
    if (
        loop.length > 1 &&
        loop[0].distanceTo(loop[loop.length - 1]) > DUPLICATE_THRESHOLD
    ) {
        loop.push(loop[0].clone());
    }
    return loop;
}

// Shortest distance from point (px,py) to the segment (x1,y1)-(x2,y2).
function distanceToLineSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    let t = lenSq === 0 ? -1 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
}

// Even-odd ray-casting point-in-polygon test.
function isPointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect =
            ((yi > y) !== (yj > y)) &&
            x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Samples a closed drawn region into points (+ surface normals) on the head:
 * fit a plane to the boundary, flatten to 2D, fill with a grid clipped to the
 * polygon, then raycast each grid point back onto the head surface. The result
 * is handed to the parent via onSurfaceGenerated and visualised as cyan dots.
 */
export default function SurfaceMesh({ lineSegments, headModel, onSurfaceGenerated }) {
    const [points, setPoints] = useState([]);
    const [normals, setNormals] = useState([]);
    const { isGenerating, setIsGenerating } = useConfigurator();
    const instancesRef = useRef();

    useEffect(() => {
        if (lineSegments.length < 3) return;
        setIsGenerating(true);

        // 1. Clean, closed boundary loop.
        const boundary = extractBoundaryLoop(lineSegments);

        // 2. Best-fit plane (accumulated cross products / Newell's method).
        const center = new THREE.Vector3();
        boundary.forEach((p) => center.add(p));
        center.divideScalar(boundary.length);

        const normal = new THREE.Vector3();
        for (let i = 0; i < boundary.length - 1; i++) {
            const v1 = new THREE.Vector3().subVectors(boundary[i], center);
            const v2 = new THREE.Vector3().subVectors(boundary[i + 1], center);
            normal.add(new THREE.Vector3().crossVectors(v1, v2));
        }
        normal.normalize();

        // Tangent/bitangent frame on the plane (guard against a degenerate axis).
        const helper = new THREE.Vector3(1, 0, 0);
        if (Math.abs(normal.dot(helper)) > 0.9) helper.set(0, 1, 0);
        const tangent = new THREE.Vector3().crossVectors(normal, helper).normalize();
        const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

        // 3. Project boundary into the 2D plane frame.
        const boundary2D = boundary.map((p) => {
            const v = p.clone().sub(center);
            return { x: tangent.dot(v), y: bitangent.dot(v) };
        });

        // 4. Bounding box of the 2D boundary.
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        boundary2D.forEach((p) => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        });

        // 5. Fill with a uniform grid, keeping the boundary plus interior cells.
        const seen = new Set();
        const keyOf = (x, y) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
        const gridPoints2D = [];
        const interior = [];

        const tryAdd = (x, y, target) => {
            const key = keyOf(x, y);
            if (seen.has(key)) return;
            seen.add(key);
            target.push({ x, y });
        };

        boundary2D.forEach((p) => tryAdd(p.x, p.y, gridPoints2D));

        const cols = Math.ceil((maxX - minX) / GRID_SPACING);
        const rows = Math.ceil((maxY - minY) / GRID_SPACING);
        for (let i = 0; i <= cols; i++) {
            for (let j = 0; j <= rows; j++) {
                const x = minX + i * GRID_SPACING;
                const y = minY + j * GRID_SPACING;
                if (isPointInPolygon(x, y, boundary2D)) tryAdd(x, y, interior);
            }
        }

        // Order interior points from the boundary inward for a nicer fill.
        interior.forEach((g) => {
            let min = Infinity;
            for (let i = 0; i < boundary2D.length - 1; i++) {
                const a = boundary2D[i];
                const b = boundary2D[i + 1];
                min = Math.min(min, distanceToLineSegment(g.x, g.y, a.x, a.y, b.x, b.y));
            }
            g.layer = Math.floor(min / GRID_SPACING);
        });
        interior.sort((a, b) => a.layer - b.layer);
        interior.forEach((g) => gridPoints2D.push({ x: g.x, y: g.y }));

        // 6. Raycast each grid point back onto the head, in non-blocking batches.
        const head = headModel.clone();
        head.scale.setScalar(HEAD_SCALE);
        head.position.copy(HEAD_POSITION);

        const raycaster = new THREE.Raycaster();
        const points3D = [];
        const pointNormals = [];

        const processBatch = (start) => {
            const end = Math.min(start + BATCH_SIZE, gridPoints2D.length);
            for (let i = start; i < end; i++) {
                const g = gridPoints2D[i];
                const origin = center
                    .clone()
                    .add(tangent.clone().multiplyScalar(g.x))
                    .add(bitangent.clone().multiplyScalar(g.y));

                let hitPoint = null;
                let hitNormal = null;
                let best = Infinity;

                // Cast both ways along the plane normal; keep the nearest hit.
                for (const dir of [normal.clone(), normal.clone().negate()]) {
                    raycaster.set(origin, dir.normalize());
                    const hits = raycaster.intersectObject(head, true);
                    if (hits.length > 0) {
                        const d = origin.distanceTo(hits[0].point);
                        if (d < best) {
                            best = d;
                            hitPoint = hits[0].point;
                            hitNormal = hits[0].face.normal.clone();
                        }
                    }
                }

                points3D.push(hitPoint || origin);
                pointNormals.push(hitNormal || normal.clone());
            }

            if (end < gridPoints2D.length) {
                setTimeout(() => processBatch(end), 0);
                return;
            }

            setPoints(points3D);
            setNormals(pointNormals);
            if (onSurfaceGenerated && points3D.length > 0) {
                onSurfaceGenerated({ points: points3D, normals: pointNormals });
            }
            setIsGenerating(false);
        };

        processBatch(0);
    }, [lineSegments, headModel, onSurfaceGenerated, setIsGenerating]);

    // Push instance matrices once the points are ready, aligning each dot with
    // its surface normal.
    useEffect(() => {
        if (!instancesRef.current || points.length === 0 || isGenerating) return;

        const dummy = new THREE.Object3D();
        for (let i = 0; i < points.length; i++) {
            const normal = normals[i];
            if (!normal) continue;
            dummy.position.copy(points[i]);
            dummy.quaternion.setFromUnitVectors(Z_AXIS, normal);
            dummy.updateMatrix();
            instancesRef.current.setMatrixAt(i, dummy.matrix);
        }
        instancesRef.current.count = points.length;
        instancesRef.current.instanceMatrix.needsUpdate = true;
    }, [points, normals, isGenerating]);

    if (isGenerating || points.length === 0) return null;

    return (
        <instancedMesh ref={instancesRef} args={[null, null, points.length]}>
            <circleGeometry args={[0.003, 8]} />
            <meshBasicMaterial color="cyan" side={THREE.DoubleSide} />
        </instancedMesh>
    );
}
