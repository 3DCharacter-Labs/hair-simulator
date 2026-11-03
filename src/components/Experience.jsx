import { useRef, useState, useEffect } from "react";
import { useGLTF, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import HairGenerator from "./HairGenerator";
import { useControls, button, folder } from 'leva';
import SurfaceMesh from "./SurfaceMesh";

export default function Experience() {
    const { scene } = useGLTF(`${import.meta.env.BASE_URL}model3.glb`);
    const [points, setPoints] = useState([]);
    const [lineSegments, setLineSegments] = useState([]); // Store each segment separately
    const [isClosed, setIsClosed] = useState(false);
    
    // Reference to the scene and raycaster
    const sceneRef = useRef();
    // Always points at the latest resetDrawing so the Leva button / keyboard
    // handler never call a stale closure.
    const resetDrawingRef = useRef(() => {});
    // Synchronous mirrors of points / normals / isClosed for the click handler.
    const pointsRef = useRef([]);
    const normalsRef = useRef([]);
    const isClosedRef = useRef(false);
    
    // Threshold distance to close the shape
    const CLOSE_THRESHOLD = 0.05;
    
    // Density of points along the drawn lines (smaller = more dense)
    const LINE_SEGMENT_LENGTH = 0.05;
    
    // Add state to store surface data for the HairGenerator
    const [surfaceData, setSurfaceData] = useState(null);
    
    // Create dense points between two points on the surface
    const createDenseLinePoints = (startPoint, endPoint, startNormal, endNormal, headObject) => {
        const distance = startPoint.distanceTo(endPoint);
        const segments = Math.max(1, Math.floor(distance / LINE_SEGMENT_LENGTH));
        const points = [];
        const raycaster = new THREE.Raycaster();
        
        for (let i = 0; i <= segments; i++) {
            // Interpolate between start and end points
            const t = i / segments;
            const point = new THREE.Vector3().lerpVectors(startPoint, endPoint, t);
            
            // Interpolate between start and end normals
            const normal = new THREE.Vector3().lerpVectors(startNormal, endNormal, t).normalize();
            
            // Project this point onto the head surface
            raycaster.set(point, normal);
            const intersects = raycaster.intersectObject(headObject, true);
            
            if (intersects.length > 0) {
                points.push(intersects[0].point);
            } else {
                // Try reverse direction
                raycaster.set(point, normal.clone().negate());
                const reverseIntersects = raycaster.intersectObject(headObject, true);
                
                if (reverseIntersects.length > 0) {
                    points.push(reverseIntersects[0].point);
                } else {
                    // If no intersection, just use the interpolated point
                    points.push(point);
                }
            }
        }
        
        return points;
    };
    
    // Raycaster setup for detecting clicks on the model.
    // Reads and updates the refs synchronously so that rapid clicks (several
    // before React re-renders) always see the latest points and normals.
    const handleClick = (event) => {
        event.stopPropagation();
        if (isClosedRef.current) return;

        const intersection = event.intersections[0];
        if (!intersection || !intersection.point || !intersection.face) return;

        const currentPoints = pointsRef.current;
        const currentNormals = normalsRef.current;

        const makeHeadObject = () => {
            const headObject = scene.clone();
            headObject.scale.set(20, 20, 20);
            headObject.position.set(0, -30, 0);
            return headObject;
        };

        // If we have points and clicked near the first point, close the shape
        if (currentPoints.length > 2) {
            const firstPoint = currentPoints[0];
            if (firstPoint.distanceTo(intersection.point) < CLOSE_THRESHOLD) {
                const closingPoints = createDenseLinePoints(
                    currentPoints[currentPoints.length - 1],
                    firstPoint,
                    currentNormals[currentNormals.length - 1],
                    currentNormals[0],
                    makeHeadObject()
                );
                isClosedRef.current = true;
                setLineSegments(prevSegments => [...prevSegments, closingPoints]);
                setIsClosed(true);
                return;
            }
        }

        // Otherwise add the new point
        const newPoint = intersection.point.clone();
        const newNormal = intersection.face.normal.clone();

        if (currentPoints.length >= 1) {
            const linePoints = createDenseLinePoints(
                currentPoints[currentPoints.length - 1],
                newPoint,
                currentNormals[currentNormals.length - 1],
                newNormal,
                makeHeadObject()
            );
            setLineSegments(prevSegments => [...prevSegments, linePoints]);
        }

        pointsRef.current = [...currentPoints, newPoint];
        normalsRef.current = [...currentNormals, newNormal];
        setPoints(pointsRef.current);
    };
    
    // Calculate stats for the shape
   
    
    // Create a shape from the points
    const renderShape = () => {
        if (points.length < 2) return null;
        
        // For open shape (still drawing)
        if (!isClosed) {
            return (
                <>
                    {/* Render each line segment separately */}
                    {lineSegments.map((segment, index) => (
                        <Line
                            key={index}
                            points={segment}
                            color="red"
                            lineWidth={1}
                            dashed={true}
                            dashSize={0.01}
                            gapSize={0.01}
                        />
                    ))}
                    
                    {/* Show dots at the clicked points */}
                    {points.map((point, index) => (
                        <mesh key={index} position={point}>
                            <sphereGeometry args={[0.01, 8, 8]} />
                            <meshBasicMaterial color="blue" />
                        </mesh>
                    ))}
                </>
            );
        }
        
        // For closed shape
        if (isClosed) {
            return (
                <>
                    {/* Render each line segment separately */}
                    {lineSegments.map((segment, index) => (
                        <Line
                            key={index}
                            points={segment}
                            color="blue"
                            lineWidth={1}
                            dashed={true}
                            dashSize={0.01}
                            gapSize={0.01}
                        />
                    ))}
                    
                    <SurfaceMesh
                        lineSegments={lineSegments}
                        headModel={scene}
                        onSurfaceGenerated={setSurfaceData}
                    />
                </>
            );
        }
    };
    
    // Leva controls. Using the functional form (no deps array) keeps the schema
    // stable so the button and toggles stay reliably wired, and Leva itself is
    // the single source of truth for these values.
    const [{ hair, hideShape, hairDirection, hairDensity }, setControls] = useControls(() => ({
        'Drawing Tools': folder({
            'Reset Drawing': button(() => resetDrawingRef.current(), {
                hint: 'Clear the current drawing (or press "r")'
            }),
            hair: { value: false, label: 'Hair' },
            hideShape: { value: false, label: 'Hide Shape' },
        }),
        'Hair Settings': folder({
            hairDirection: {
                value: 0,
                label: 'Direction',
                options: { Up: 0, Left: 1, Right: 2 },
            },
            hairDensity: {
                value: 1,
                label: 'Density',
                min: 1,
                max: 20,
                step: 1,
            },
        }, { collapsed: false }),
    }));

    // Reset drawing: clears the drawing AND the generated hair/surface.
    const resetDrawing = () => {
        pointsRef.current = [];
        normalsRef.current = [];
        isClosedRef.current = false;
        setPoints([]);
        setLineSegments([]);
        setIsClosed(false);
        setSurfaceData(null);
        setControls({ hair: false });
    };
    resetDrawingRef.current = resetDrawing;
    
    // Add keyboard event listener
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'r') {
                resetDrawingRef.current();
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    return (
        <>
            <primitive 
                ref={sceneRef}
                object={scene} 
                scale={20}
                position={[0, -35, 0]} 
                onClick={handleClick}
                onPointerMissed={() => {}}
            />
            
            {/* Position the drawing slightly in front of the model to prevent z-fighting */}
            <group visible={!hideShape} position={[0, 0, 0.011]}>
                {renderShape()}
            </group>
            
            {/* Only render HairGenerator if we have surface data and hair is enabled */}
            {hair && surfaceData && <HairGenerator surfaceData={surfaceData} hairDirection={hairDirection} hairDensity={hairDensity} />}
            
            {/* Instruction text for new users */}
            {!isClosed && points.length > 2 && (
                <Html position={[0, 50, 0]} center style={{ color: 'white', backgroundColor: 'rgba(0,0,0,0.5)', padding: '5px', borderRadius: '3px' }}>
                    Click near first point to close shape
                </Html>
            )}
        </>
    );
}


// Modified for better performance with dense grids
