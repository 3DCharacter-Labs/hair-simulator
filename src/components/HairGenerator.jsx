import { HairMaterial } from "./HairMaterial";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { nextPowerOfTwo, randomInRange } from "../modules/Maf";
import { pointsOnSphere } from "./Fibonacci";
import { CurlPass } from "./CurlPass";

export default function HairGenerator({ surfaceData, hairDirection, hairDensity }) {
    const instancedMesh = useRef();
    const meshRef = useRef();
    const positionTexture = useRef();

    // Build the strand geometry/material once. If these were recreated on every
    // render, R3F would rebuild the instancedMesh (resetting all instance
    // matrices) whenever an unrelated control changed, making the hair vanish.
    const geometry = useMemo(() => {
        const geo = new THREE.PlaneGeometry(0.0003, 0.03, 2, 10);
        geo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.005, 0));
        geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
        return geo;
    }, []);

    const material = useMemo(
        () => new HairMaterial({ wireframe: false, side: THREE.DoubleSide }),
        []
    );

    const curlPass = useRef();


    useEffect(() => {
        if (surfaceData) {
            meshRef.current = surfaceData;
        }
    }, [surfaceData]);

    const numPoints = 100000;
    const [points] = useState(() => pointsOnSphere(numPoints));

    const {gl} = useThree();

    function distributeHair() {
        if (!meshRef.current || !instancedMesh.current) return;

        // Use the points and normals arrays from surfaceData
        const surfacePoints = meshRef.current.points;
        const surfaceNormals = meshRef.current.normals;
        
        if (!surfacePoints || !surfaceNormals || surfacePoints.length === 0) {
            console.warn("No valid surface data available");
            return;
        }

        const dummy = new THREE.Object3D();

        const width = nextPowerOfTwo(Math.sqrt(points.length));
        const height = Math.ceil(points.length / width);
        // One RGBA texel per instance: xyz = world position (a = unused).
        const positionData = new Float32Array(width * height * 4);
        // Number of strands to place, scaled by density and capped to the
        // instance buffer size (points.length).
        const baseCount = Math.min(points.length, surfacePoints.length);
        const totalInstances = Math.min(points.length, Math.floor(baseCount * hairDensity));

        for (let i = 0; i < totalInstances; i++) {
            // Pick a random point from the surface points
            const randomIndex = Math.floor(Math.random() * surfacePoints.length);
            
            // Get the point and its normal
            const p = surfacePoints[randomIndex].clone();
            const n = surfaceNormals[randomIndex].clone().normalize();

            // Apply the position to the instance
            dummy.position.copy(p);

            // Apply uniform scaling
            dummy.scale.set(5, 5, 5);

            // Ensure correct orientation
            dummy.lookAt(p.clone().add(n.multiplyScalar(0.5)));

            // Add slight random rotation for variation
            dummy.rotateY((Math.random() - 2) * 2)
            dummy.rotateX((Math.random() - 4) * 6)
            

            // Update instance matrix
            dummy.updateMatrix();
            
            // Store position data
            positionData[i * 4] = p.x;
            positionData[i * 4 + 1] = p.y;
            positionData[i * 4 + 2] = p.z;
            positionData[i * 4 + 3] = 1.0;
            
            instancedMesh.current.setMatrixAt(i, dummy.matrix);
        }
        
        // Only render the strands we actually placed, so lowering the density
        // slider removes hair instead of leaving stale instances on screen.
        instancedMesh.current.count = totalInstances;
        instancedMesh.current.instanceMatrix.needsUpdate = true;

        if (!curlPass.current) {
            // First setup: build the position texture + curl pass once.
            positionTexture.current = new THREE.DataTexture(
                positionData,
                width,
                height,
                THREE.RGBAFormat,
                THREE.FloatType,
                undefined,
                THREE.ClampToEdgeWrapping,
                THREE.ClampToEdgeWrapping,
                THREE.NearestFilter,
                THREE.NearestFilter
            );
            positionTexture.current.needsUpdate = true;
            curlPass.current = new CurlPass(gl, positionTexture.current, width, height);
            material.uniforms.curlMap.value = curlPass.current.texture;
        } else {
            // Re-distributing (e.g. density changed): refresh the positions the
            // curl field is sampled from.
            positionTexture.current.image.data.set(positionData);
            positionTexture.current.needsUpdate = true;
        }
        material.uniforms.hairDirection.value = hairDirection;
    
        curlPass.current.shader.uniforms.persistence.value = randomInRange(2, 3);
        curlPass.current.shader.uniforms.speed.value = randomInRange(1, 3);

        // Render the curl/noise field once (static). Each strand samples a stable
        // value from it for shading - no per-frame updates, so nothing moves.
        curlPass.current.shader.uniforms.time.value = 0;
        curlPass.current.render();
    }

    // Re-distribute hair whenever the surface data or hair controls change
    useEffect(() => {
        if (meshRef.current && instancedMesh.current) {
            distributeHair();
        }
    }, [surfaceData, hairDirection, hairDensity]);
    




    return (
        <>

            <instancedMesh
                ref={instancedMesh}
                args={[geometry, material, points.length]}
                frustumCulled={false}
            />
        </>
    );

}