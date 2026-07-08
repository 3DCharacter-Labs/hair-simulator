import { createContext, useContext, useState } from "react";

const ConfiguratorContext = createContext();

export const ConfiguratorProvider = ({ children }) => {

    const [isGenerating, setIsGenerating] = useState(false);
  return (
    <ConfiguratorContext.Provider
      value={{
        isGenerating,
        setIsGenerating,
      }}
    >
      {children}
    </ConfiguratorContext.Provider>
  );
};

export const useConfigurator = () => {
  return useContext(ConfiguratorContext);
};