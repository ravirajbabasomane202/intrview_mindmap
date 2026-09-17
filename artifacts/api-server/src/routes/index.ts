import { Router, type IRouter } from "express";
import healthRouter from "./health";
import notesRouter from "./notes";
import foldersRouter from "./folders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(notesRouter);
router.use(foldersRouter);

export default router;
