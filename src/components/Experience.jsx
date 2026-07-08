import { useRef, useState, useEffect } from "react";
import { useGLTF, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import HairGenerator from "./HairGenerator";
import { useControls, button, folder } from 'leva';
import SurfaceMesh from "./SurfaceMesh";

export default function Experience() {
    const { scene } = useGLTF('/model3.glb');
    const [points, setPoints] = useState([]);
    const [lineSegments, setLineSegments] = useState([]); // Store each segment separately
    const [isClosed, setIsClosed] = useState(false);
    
    // Reference to the scene and raycaster
    const sceneRef = useRef();
    // Always points at the latest resetDrawing so the Leva button / keyboard
    // handler never call a stale closure.
    const resetDrawingRef = useRef(() => {});
    
    // Threshold distance to close the shape
    const CLOSE_THRESHOLD = 0.05;
    
    // Store normals at each point to help with surface conforming
    const [normals, setNormals] = useState([]);
    
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
    
    // Raycaster setup for detecting clicks on the model
    const handleClick = (event) => {
        event.stopPropagation();
        
        // Get intersection point on the model
        const intersection = event.intersections[0];
        if (intersection && intersection.point) {
            // If we have points and clicked near the first point, close the shape
            if (points.length > 2 && !isClosed) {
                const firstPoint = points[0];
                const clickPoint = intersection.point;
                const distance = firstPoint.distanceTo(clickPoint);
                
                if (distance < CLOSE_THRESHOLD) {
                    // Use the first point exactly for closing to ensure perfect closure
                    const headObject = scene.clone();
                    headObject.scale.set(20, 20, 20);
                    headObject.position.set(0, -30, 0);
                    
                    const lastPoint = points[points.length - 1];
                    const lastNormal = normals[normals.length - 1];
                    const firstNormal = normals[0];
                    
                    // Create dense points for closing the shape
                    const closingPoints = createDenseLinePoints(
                        lastPoint, firstPoint, lastNormal, firstNormal, headObject
                    );
                    
                    // Add the closing segment
                    setLineSegments(prevSegments => [...prevSegments, closingPoints]);
                    setIsClosed(true);
                    
                    // Calculate approximate area
                    return;
                }
            }
            
            // Otherwise add the new point to our points array
            if (!isClosed) {
                const newPoint = intersection.point;
                const newNormal = intersection.face.normal.clone();
                
                setPoints(prevPoints => {
                    const newPoints = [...prevPoints, newPoint];
                    
                    // If we have at least two points, create dense points between them
                    if (newPoints.length >= 2) {
                        const headObject = scene.clone();
                        headObject.scale.set(20, 20, 20);
                        headObject.position.set(0, -30, 0);
                        
                        const prevPoint = prevPoints[prevPoints.length - 1];
                        const prevNormal = normals[normals.length - 1];
                        
                        const linePoints = createDenseLinePoints(
                            prevPoint, newPoint, prevNormal, newNormal, headObject
                        );
                        
                        // Store each segment separately
                        setLineSegments(prevSegments => [...prevSegments, linePoints]);
                    }
                    
                    return newPoints;
                });
                
                // Store the face normal
                setNormals(prevNormals => [...prevNormals, newNormal]);
            }
        }
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
        setPoints([]);
        setLineSegments([]);
        setNormals([]);
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
