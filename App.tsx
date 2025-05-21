/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useCallback } from 'react';
import StepGoal from './components/StepGoal';
import StepSubject from './components/StepSubject';
import StepTopics from './components/StepTopics';
import StepTime from './components/StepTime';
import LearningPlanDisplay from './components/LearningPlanDisplay';
import PomodoroTimer from './components/PomodoroTimer';
import type { LearningPlanItem, PlanGenerationError } from './lib/types';
import { extractTopicsFromImageAPI, generateLearningPlanAPI } from './lib/gemini';
import LoadingSpinner from './components/LoadingSpinner';

type AppStep = 'goal' | 'subject' | 'topics' | 'time' | 'plan' | 'timer';

export default function App() {
  const [currentStep, setCurrentStep] = useState<AppStep>('goal');
  const [learningGoal, setLearningGoal] = useState('');
  const [subject, setSubject] = useState('');
  const [topicsText, setTopicsText] = useState('');
  const [syllabusImage, setSyllabusImage] = useState<File | null>(null);
  const [syllabusImagePreview, setSyllabusImagePreview] = useState<string | null>(null);
  const [totalTime, setTotalTime] = useState<number>(60);
  const [learningPlan, setLearningPlan] = useState<LearningPlanItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanGenerationError | null>(null);

  const resetToStep = (step: AppStep) => {
    setCurrentStep(step);
    setLearningPlan(null);
    setPlanError(null);
    setErrorMessage(null);
  }

  const handleNext = () => {
    setErrorMessage(null);
    setPlanError(null);
    switch (currentStep) {
      case 'goal':
        if (!learningGoal.trim()) {
          setErrorMessage("Please enter your learning goal.");
          return;
        }
        setCurrentStep('subject');
        break;
      case 'subject':
        if (!subject.trim()) {
          setErrorMessage("Please enter the subject.");
          return;
        }
        setCurrentStep('topics');
        break;
      case 'topics':
        if (!topicsText.trim() && !syllabusImage) {
          setErrorMessage("Please enter topics or upload a syllabus image.");
          return;
        }
        setCurrentStep('time');
        break;
      case 'time':
        if (totalTime < 10) {
          setErrorMessage("Please enter a valid time (at least 10 minutes).");
          return;
        }
        handleGeneratePlan();
        break;
      case 'plan':
        setCurrentStep('timer');
        break;
      default:
        break;
    }
  };

  const handleBack = () => {
    setErrorMessage(null);
    setPlanError(null);
    switch (currentStep) {
      case 'subject':
        setCurrentStep('goal');
        break;
      case 'topics':
        setCurrentStep('subject');
        break;
      case 'time':
        setCurrentStep('topics');
        break;
      case 'plan':
        setCurrentStep('time'); // Allow re-generating or editing time
        setLearningPlan(null); // Clear previous plan
        break;
      case 'timer':
         // Option to go back to plan or edit further up
        setCurrentStep('plan');
        break;
      default:
        break;
    }
  };

  const handleImageUpload = useCallback(async (file: File) => {
    setSyllabusImage(file);
    setTopicsText(''); // Clear manual topics if image is uploaded
    setErrorMessage(null);
    setPlanError(null);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result as string;
      setSyllabusImagePreview(base64Data);
      setIsLoading(true);
      try {
        const extracted = await extractTopicsFromImageAPI(base64Data.split(',')[1]); // Pass only base64 part
        setTopicsText(extracted);
      } catch (error: any) {
        console.error("Error extracting topics from image:", error);
        setErrorMessage(error.message || "Failed to extract topics from image. Please type them manually.");
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
  }, []);


  const handleGeneratePlan = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setPlanError(null);
    setLearningPlan(null);

    let finalTopics = topicsText;
    if (syllabusImage && !topicsText.trim()) { // If image was uploaded but extraction might have been slow or user didn't wait
        if (syllabusImagePreview) {
             try {
                const extracted = await extractTopicsFromImageAPI(syllabusImagePreview.split(',')[1]);
                finalTopics = extracted;
                setTopicsText(extracted); // Update state if extraction happens here
            } catch (error: any) {
                setErrorMessage(error.message || "Failed to extract topics from image during plan generation. Using any typed topics.");
                // Proceed with potentially empty finalTopics if user typed nothing
            }
        }
    }
    
    if (!finalTopics.trim()){
        setErrorMessage("No topics available to generate a plan. Please ensure topics are entered or extracted from syllabus.");
        setIsLoading(false);
        setCurrentStep('topics'); // Go back to topics step
        return;
    }

    try {
      const result = await generateLearningPlanAPI(learningGoal, subject, finalTopics, totalTime);
      if (Array.isArray(result)) {
        setLearningPlan(result);
        setCurrentStep('plan');
      } else if (result.error) {
        setPlanError(result);
        setCurrentStep('plan'); // Show error on plan page
      } else {
         throw new Error("Unexpected response format from plan generation.");
      }
    } catch (error: any) {
      console.error("Error generating learning plan:", error);
      setErrorMessage(error.message || "Failed to generate learning plan.");
    } finally {
      setIsLoading(false);
    }
  };
  
  const restartApp = () => {
    setCurrentStep('goal');
    setLearningGoal('');
    setSubject('');
    setTopicsText('');
    setSyllabusImage(null);
    setSyllabusImagePreview(null);
    setTotalTime(60);
    setLearningPlan(null);
    setIsLoading(false);
    setErrorMessage(null);
    setPlanError(null);
  };


  const renderStep = () => {
    if (isLoading && (currentStep === 'topics' || currentStep === 'time' || currentStep === 'plan')) {
        let loadingMessage = "Processing...";
        if (currentStep === 'topics' && syllabusImage) loadingMessage = "Extracting topics from syllabus...";
        if (currentStep === 'time' || (currentStep === 'plan' && !learningPlan && !planError)) loadingMessage = "Generating your learning plan...";
        return <LoadingSpinner message={loadingMessage} />;
    }

    switch (currentStep) {
      case 'goal':
        return <StepGoal learningGoal={learningGoal} setLearningGoal={setLearningGoal} onNext={handleNext} errorMessage={errorMessage} />;
      case 'subject':
        return <StepSubject subject={subject} setSubject={setSubject} onNext={handleNext} onBack={handleBack} errorMessage={errorMessage} />;
      case 'topics':
        return <StepTopics topicsText={topicsText} setTopicsText={setTopicsText} onImageUpload={handleImageUpload} imagePreview={syllabusImagePreview} onNext={handleNext} onBack={handleBack} isLoading={isLoading && !!syllabusImage} errorMessage={errorMessage}/>;
      case 'time':
        return <StepTime totalTime={totalTime} setTotalTime={setTotalTime} onNext={handleGeneratePlan} onBack={handleBack} errorMessage={errorMessage}/>;
      case 'plan':
        return <LearningPlanDisplay learningPlan={learningPlan} planError={planError} onStart={handleNext} onBack={() => resetToStep('time')} onEditTopics={() => resetToStep('topics')} isLoading={isLoading} />;
      case 'timer':
        return learningPlan ? <PomodoroTimer learningPlan={learningPlan} onSessionEnd={restartApp} /> : <p>No plan available. Please go back.</p>;
      default:
        return <p>Welcome! Let's create your learning plan.</p>;
    }
  };

  return (
    <div className="app-container">
      <h1>Personalized Learning Plan</h1>
      {renderStep()}
    </div>
  );
}