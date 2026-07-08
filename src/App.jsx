import { Canvas } from '@react-three/fiber'
import Experience from './components/Experience.jsx';
import { CameraControls } from '@react-three/drei';
import { EffectComposer, FXAA } from "@react-three/postprocessing";
import { useConfigurator } from './context/Configurator.jsx';
import { Leva } from 'leva';
const customTheme = {
  colors: {
    elevation1: '#1e1e1e', // background
    elevation2: '#2a2a2a', // panel background
    elevation3: '#333333', // control background
    accent1: '#ff7bff',    // active color (e.g., sliders, buttons)
    accent2: '#44457f',    // hovered color
    accent3: '#ff3f7f',    // pressed color
    highlight1: '#ffffff', // text
    highlight2: '#999999', // secondary text
    highlight3: '#aaa', // borders
  }
}
function App() {
  const { isGenerating } = useConfigurator();
  return (
    <>
         
         <Leva theme={customTheme} />  
      <Canvas gl={{ antialias: true, preserveDrawingBuffer: false }} dpr={[1, 2]} camera={{ position: [0, 0, 10], fov: 45, near: 0.1, far: 100, frustumCulled: false }} style={{ width: '100%', height: '100vh', position: 'absolute', top: 0, left: 0, backgroundColor: '#2C5364' }}>

        <ambientLight />
        <pointLight position={[10, 10, 10]} />
        <Experience />
        <CameraControls
          enabled={!isGenerating}
          minDistance={5}
          maxDistance={20}
          minPolarAngle={0.25}
          maxPolarAngle={Math.PI - 0.25}
          dollySpeed={0.5}
        />
        <EffectComposer>
          <FXAA />
        </EffectComposer>
      </Canvas>
      <Loadable isGenerating={isGenerating} />
    </>
  )
}

export default App


const Loadable = ({isGenerating}) => {
  
  return isGenerating ? 
  <div className='loading'> 
    <div className="spinner"></div>
    <div>Generating surface points... </div>
  </div> : null;
}