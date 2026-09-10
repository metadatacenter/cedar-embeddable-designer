import { describe, expect, it } from 'vitest';
import {
  Annotations,
  AnnotationAtId,
  AnnotationAtValue,
  BiboStatus,
  CedarArtifactId,
  CedarUser,
  IsoDate,
  Language,
} from 'cedar-model-typescript-library';
import { buildTemplate, readTemplate, templateToJson, templateToYaml, toDesignerTemplate } from './cedar-template';

for (const format of ['JSON', 'YAML']) {
  describe(`${format} container metadata`, () => {
    it('preserves imported lifecycle and container properties through opening and editing', () => {
      const template = buildTemplate({
        name: 'Study',
        description: 'Study help',
        identifier: 'urn:test:study',
        version: '2.3.4',
        fields: [],
      });
      template.bibo_status = BiboStatus.PUBLISHED;
      template.pav_createdOn = IsoDate.forValue('2026-09-01T00:00:00Z');
      template.pav_lastUpdatedOn = IsoDate.forValue('2026-09-02T00:00:00Z');
      template.pav_createdBy = CedarUser.forValue('urn:test:creator');
      template.oslc_modifiedBy = CedarUser.forValue('urn:test:editor');
      template.pav_derivedFrom = CedarArtifactId.forValue('urn:test:source');
      template.pav_previousVersion = CedarArtifactId.forValue('urn:test:previous');
      template.schema_identifier = 'study-id';
      template.language = Language.forValue('en');
      template.instanceTypeSpecification = 'urn:test:instance-type';
      template.header = 'Header';
      template.footer = 'Footer';
      template.annotations = new Annotations();
      template.annotations.add(new AnnotationAtValue('note', 'Preserve me'));
      template.annotations.add(new AnnotationAtId('source', 'urn:test:annotation'));
      const original = templateToJson(template);
      const source = format === 'JSON' ? original : templateToYaml(template);
      const state = toDesignerTemplate(readTemplate(source));
      expect(templateToJson(buildTemplate(state))).toEqual(original);
      const edited = templateToJson(buildTemplate({ ...state, name: 'Renamed', version: '2.3.5' }));
      expect(edited).toEqual({ ...original, 'schema:name': 'Renamed', 'pav:version': '2.3.5' });
    });
  });
}
