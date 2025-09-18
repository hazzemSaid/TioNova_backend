import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import nsfwjs from "nsfwjs";


const PredictedUnwantedImage = async (file: Express.Multer.File, model: any) => {
	const imageBuffer = fs.readFileSync(file.path);
	const img = await loadImage(imageBuffer);
	const canvas = await createCanvas(img.width, img.height);
	canvas.getContext('2d').drawImage(img, 0, 0);
	const predictions = await model.classify(canvas);
	console.log(predictions);
	return unwantedPredictions(predictions);
};

const unwantedPredictions: (predictions: any) => boolean = (predictions: any) => {
	const unwantedLabels = ["Porn", "Sexy", "Neutral"];
	return predictions.filter((prediction: nsfwjs.PredictionType) => unwantedLabels.includes(prediction.className)
		&& prediction.probability >= 0.5).length > 0 ? true : false;
};
const processAllImages = async (files: Express.Multer.File[], model: any) => {
	const promises = files.map(file => PredictedUnwantedImage(file, model));
	const results = await Promise.all(promises);

	return results.includes(true);
};
export default processAllImages;